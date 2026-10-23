// Senhas e sessões do RotaU.
// Senhas: scrypt (node:crypto) com sal aleatório. Sessões: token aleatório num
// cookie httpOnly; o banco guarda só o hash SHA-256 do token.
import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual, type ScryptOptions } from "node:crypto";
import type { Request, Response } from "express";
import { ApiError } from "./errors.ts";

export type Profile = "student" | "driver" | "admin";
export type SessionUser = { profile: Profile; id: number };

export const SESSION_COOKIE = "rotau_session";
export const SESSION_DAYS = 30;
export const MIN_PASSWORD_LENGTH = 8;

const scryptParams = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

function deriveKey(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { ...options, maxmem: MAX_MEMORY }, (error, key) =>
      error ? reject(error) : resolve(key));
  });
}

export function validatePassword(password: unknown): string {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new ApiError(400, `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (password.length > 200) throw new ApiError(400, "A senha é longa demais.");
  return password;
}

// Formato salvo: scrypt$N$r$p$sal$hash (sal e hash em base64)
function formatHash(salt: Buffer, key: Buffer): string {
  const { N, r, p } = scryptParams;
  return ["scrypt", N, r, p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return formatHash(salt, await deriveKey(password, salt, scryptParams));
}

// Versão síncrona, usada só para criar os dados de exemplo
export function hashPasswordSync(password: string): string {
  const salt = randomBytes(16);
  return formatHash(salt, scryptSync(password.normalize("NFKC"), salt, KEY_LENGTH, { ...scryptParams, maxmem: MAX_MEMORY }));
}

// Hash usado quando o e-mail não existe, para a resposta levar o mesmo tempo
const dummyHash = hashPassword(randomBytes(16).toString("hex"));

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const [scheme, N, r, p, salt, hash] = (stored ?? (await dummyHash)).split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await deriveKey(password, Buffer.from(salt, "base64"), { N: Number(N), r: Number(r), p: Number(p) });
  return Boolean(stored) && key.length === expected.length && timingSafeEqual(key, expected);
}

export function newSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function readSessionCookie(req: Request): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

// Secure quando a requisição chega por HTTPS (com TRUST_PROXY atrás de um proxy) ou COOKIE_SECURE=true
function cookieOptions(req: Request) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: req.secure || process.env.COOKIE_SECURE === "true",
    path: "/",
  };
}

export function setSessionCookie(req: Request, res: Response, token: string, days = SESSION_DAYS) {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(req), maxAge: days * 24 * 60 * 60 * 1000 });
}

export function clearSessionCookie(req: Request, res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions(req));
}

// Limita tentativas de login erradas por IP + e-mail (em memória)
export function createLoginLimiter({ maxFailures = 10, windowMs = 15 * 60 * 1000 } = {}) {
  const failures = new Map<string, { count: number; resetAt: number }>();
  return {
    check(key: string) {
      const entry = failures.get(key);
      if (entry && entry.resetAt > Date.now() && entry.count >= maxFailures) {
        throw new ApiError(429, "Muitas tentativas de login. Tente de novo em alguns minutos.");
      }
    },
    fail(key: string) {
      const now = Date.now();
      const entry = failures.get(key);
      if (!entry || entry.resetAt <= now) failures.set(key, { count: 1, resetAt: now + windowMs });
      else entry.count++;
      if (failures.size > 10_000) {
        for (const [k, v] of failures) if (v.resetAt <= now) failures.delete(k);
      }
    },
    reset(key: string) {
      failures.delete(key);
    },
  };
}
