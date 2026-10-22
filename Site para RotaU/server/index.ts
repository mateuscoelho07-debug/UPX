// API REST do RotaU. Rode com `pnpm api` (porta 3001 por padrão).
import express, { type ErrorRequestHandler, type Request, type RequestHandler, type Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ApiError, openDatabase, type Repository } from "./db.ts";
import {
  clearSessionCookie,
  createLoginLimiter,
  hashPassword,
  hashToken,
  newSessionToken,
  readSessionCookie,
  SESSION_DAYS,
  setSessionCookie,
  validatePassword,
  verifyPassword,
  type Profile,
  type SessionUser,
} from "./auth.ts";

export type AppOptions = { adminPassword?: string };

// ADMIN_TOKEN é o nome antigo da variável e continua aceito
export function createApp(
  repo: Repository = openDatabase(),
  { adminPassword = process.env.ADMIN_PASSWORD ?? process.env.ADMIN_TOKEN }: AppOptions = {},
) {
  const app = express();
  // Atrás de um proxy HTTPS (ex.: hospedagem), defina TRUST_PROXY para o Express ver o IP e o protocolo reais
  if (process.env.TRUST_PROXY) app.set("trust proxy", /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);
  app.disable("x-powered-by");
  app.use(express.json());

  // Requisições que alteram dados precisam vir em JSON: formulários de outros
  // sites não conseguem enviar esse tipo, o que bloqueia ataques CSRF.
  app.use("/api", (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !req.is("application/json")) {
      res.status(415).json({ error: "Envie os dados em JSON." });
      return;
    }
    next();
  });

  // Identifica o usuário logado pelo cookie de sessão
  app.use("/api", (req, res, next) => {
    const token = readSessionCookie(req);
    if (!token) return next();
    Promise.resolve(repo.getSession(hashToken(token)))
      .then((user) => {
        if (user) res.locals.user = user;
        else clearSessionCookie(req, res);
        next();
      })
      .catch(next);
  });

  const route = (handler: (req: Request, res: Response) => unknown, status?: number): RequestHandler => (req, res, next) => {
    Promise.resolve()
      .then(() => handler(req, res))
      .then((result) => res.status(status ?? (req.method === "POST" ? 201 : 200)).json(result))
      .catch(next);
  };
  const id = (value: unknown): number => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new ApiError(400, "Identificador inválido.");
    return parsed;
  };
  const body = (req: Request) => (req.body ?? {}) as Record<string, never>;

  // Exige login com um dos perfis; com `ownId`, só o próprio usuário pode acessar
  const requireUser = (res: Response, profile: Profile, ownId?: number): SessionUser => {
    const user = res.locals.user as SessionUser | undefined;
    if (!user) throw new ApiError(401, "Faça login para continuar.");
    if (user.profile !== profile || (ownId !== undefined && user.id !== ownId)) {
      throw new ApiError(403, "Você não tem permissão para acessar estes dados.");
    }
    return user;
  };

  const startSession = async (req: Request, res: Response, user: SessionUser) => {
    const old = readSessionCookie(req);
    if (old) await repo.deleteSession(hashToken(old));
    const { token, tokenHash } = newSessionToken();
    // Sessão de administrador dura só um dia
    const days = user.profile === "admin" ? 1 : SESSION_DAYS;
    await repo.createSession(tokenHash, user, days);
    setSessionCookie(req, res, token, days);
    return { ...user, name: await repo.accountName(user) };
  };

  const limiter = createLoginLimiter();

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/api/colleges", route(() => repo.listColleges()));
  app.post("/api/searches", route((req) => repo.searchRoutes(body(req))));

  // Cadastro: cria a conta com senha e já deixa o usuário logado
  app.post("/api/students", route(async (req, res) => {
    const data = body(req) as Record<string, unknown>;
    const passwordHash = await hashPassword(validatePassword(data.password));
    const student = await repo.createStudent({ ...data, passwordHash });
    await startSession(req, res, { profile: "student", id: student.id });
    return student;
  }));
  app.get("/api/students/:id", route((req, res) => {
    const studentId = id(req.params.id);
    requireUser(res, "student", studentId);
    return repo.getStudent(studentId);
  }));

  app.post("/api/drivers", route(async (req, res) => {
    const data = body(req) as Record<string, unknown>;
    const passwordHash = await hashPassword(validatePassword(data.password));
    const driver = await repo.createDriver({ ...data, passwordHash });
    await startSession(req, res, { profile: "driver", id: driver.id });
    return driver;
  }));
  app.get("/api/drivers/:id", route((req, res) => {
    const driverId = id(req.params.id);
    requireUser(res, "driver", driverId);
    return repo.getDriver(driverId);
  }));
  app.get("/api/drivers/:id/dashboard", route((req, res) => {
    const driverId = id(req.params.id);
    requireUser(res, "driver", driverId);
    return repo.driverDashboard(driverId);
  }));

  // Login, logout e "quem sou eu"
  app.post("/api/auth/login", route(async (req, res) => {
    const { profile, email, password } = body(req) as Record<string, unknown>;
    if (profile !== "student" && profile !== "driver") throw new ApiError(400, "Escolha o perfil: estudante ou motorista.");
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      throw new ApiError(400, "Informe e-mail e senha.");
    }
    const key = `${req.ip}|${profile}|${email.trim().toLowerCase()}`;
    limiter.check(key);
    const account = await repo.findAccount(profile, email);
    if (!(await verifyPassword(password, account?.passwordHash)) || !account) {
      limiter.fail(key);
      throw new ApiError(401, "E-mail ou senha incorretos.");
    }
    limiter.reset(key);
    return startSession(req, res, { profile, id: account.id });
  }, 200));

  app.post("/api/auth/logout", route(async (req, res) => {
    const token = readSessionCookie(req);
    if (token) await repo.deleteSession(hashToken(token));
    clearSessionCookie(req, res);
    return { ok: true };
  }, 200));

  app.get("/api/auth/me", route(async (_req, res) => {
    const user = res.locals.user as SessionUser | undefined;
    if (!user) throw new ApiError(401, "Você não está logado.");
    return { ...user, name: await repo.accountName(user) };
  }));

  // Vans de uma faculdade são públicas; com login de estudante, mostra as dele e marca as reservadas
  app.get("/api/vans", route((req, res) => {
    if (typeof req.query.college === "string" && res.locals.user?.profile !== "student") return repo.listVans({ college: req.query.college });
    const student = requireUser(res, "student", req.query.studentId ? id(req.query.studentId) : undefined);
    return repo.listVans({ studentId: student.id });
  }));

  // Estudante reserva vaga para si mesmo
  app.post("/api/bookings", route((req, res) => {
    const student = requireUser(res, "student");
    return repo.createBooking({ studentId: student.id, driverId: body(req).driverId });
  }));
  // Só o motorista da van confirma ou recusa a reserva
  app.patch("/api/bookings/:id", route(async (req, res) => {
    const bookingId = id(req.params.id);
    requireUser(res, "driver", await repo.bookingDriverId(bookingId));
    const { status, pickupTime } = body(req);
    return repo.updateBooking(bookingId, { status, pickupTime });
  }));

  // Painel de administração: exige login com a senha definida em ADMIN_PASSWORD.
  // Sem essa variável, o painel fica desativado.
  app.post("/api/admin/login", route(async (req, res) => {
    if (!adminPassword) throw new ApiError(503, "Painel desativado: defina a variável ADMIN_PASSWORD no servidor.");
    const { password } = body(req) as Record<string, unknown>;
    const key = `${req.ip}|admin`;
    limiter.check(key);
    const given = createHash("sha256").update(String(password ?? "")).digest();
    const expected = createHash("sha256").update(adminPassword).digest();
    if (!timingSafeEqual(given, expected)) {
      limiter.fail(key);
      throw new ApiError(401, "Senha de administrador incorreta.");
    }
    limiter.reset(key);
    return startSession(req, res, { profile: "admin", id: 0 });
  }, 200));
  app.get("/api/admin/overview", route((_req, res) => {
    if (!adminPassword) throw new ApiError(503, "Painel desativado: defina a variável ADMIN_PASSWORD no servidor.");
    requireUser(res, "admin");
    return repo.adminOverview();
  }));

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Rota não encontrada." });
  });

  // Em produção, a mesma API serve o front end já compilado (pnpm build)
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(dist, "index.html"));
    });
  }

  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ApiError) {
      res.status(error.status).json({ error: error.message });
    } else if (error instanceof SyntaxError) {
      res.status(400).json({ error: "JSON inválido." });
    } else {
      console.error(error);
      res.status(500).json({ error: "Erro interno do servidor." });
    }
  };
  app.use(handleError);

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.API_PORT ?? 3001);
  createApp().listen(port, () => console.log(`API do RotaU rodando em http://localhost:${port}`));
}
