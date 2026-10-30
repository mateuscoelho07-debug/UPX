// API REST do RotaU (rotas /api/*). Roda dentro do servidor do Angular (src/server.ts),
// tanto no `pnpm dev` quanto na Vercel.
import express, { type ErrorRequestHandler, type Request, type RequestHandler, type Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError, DEMO_VAN_DOMAIN, openDatabase, type Repository } from "./db.ts";
import { termsDocument, termsPdf } from "./terms.ts";
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

// ADMIN_TOKEN é o nome antigo da variável e continua aceito.
// O banco abre de forma assíncrona e só na primeira chamada à API (o build do Angular
// carrega este arquivo e não deve tocar no banco); as rotas esperam ele ficar pronto.
export function createApp(
  database: Repository | Promise<Repository> | (() => Promise<Repository>) = openDatabase,
  { adminPassword = process.env.ADMIN_PASSWORD ?? process.env.ADMIN_TOKEN }: AppOptions = {},
) {
  let opening: Promise<Repository> | undefined;
  const ready = () => {
    // se falhar, tenta abrir de novo na próxima chamada
    opening ??= Promise.resolve(typeof database === "function" ? database() : database).catch((error) => {
      opening = undefined;
      throw error;
    });
    return opening;
  };
  let repo: Repository;
  const app = express();
  // Atrás de um proxy HTTPS (ex.: hospedagem), defina TRUST_PROXY para o Express ver o IP e o protocolo reais
  if (process.env.TRUST_PROXY) app.set("trust proxy", /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);
  app.disable("x-powered-by");
  app.use("/api", express.json());

  // Requisições que alteram dados precisam vir em JSON: formulários de outros
  // sites não conseguem enviar esse tipo, o que bloqueia ataques CSRF.
  app.use("/api", (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !req.is("application/json")) {
      res.status(415).json({ error: "Envie os dados em JSON." });
      return;
    }
    next();
  });

  app.use("/api", (_req, _res, next) => {
    ready().then((opened) => {
      repo = opened;
      next();
    }, next);
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
  const currentUser = (res: Response): SessionUser => {
    const user = res.locals.user as SessionUser | undefined;
    if (!user || user.profile === "admin") throw new ApiError(401, "Faça login para continuar.");
    return user;
  };

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

  // Termos de segurança e conduta (RF010): texto público e PDF para exportar.
  // Com ?driverId, o PDF traz o aceite digital desse motorista; só ele ou um aluno com reserva na van dele pode pedir.
  app.get("/api/terms", route(() => termsDocument));
  app.get("/api/terms.pdf", async (req, res, next) => {
    try {
      let acceptance;
      if (req.query.driverId !== undefined) {
        const driverId = id(req.query.driverId);
        const user = res.locals.user as SessionUser | undefined;
        if (!user) throw new ApiError(401, "Faça login para continuar.");
        const allowed = (user.profile === "driver" && user.id === driverId)
          || (user.profile === "student" && (await repo.studentDriverId(user.id)) === driverId);
        if (!allowed) throw new ApiError(403, "Você não tem permissão para acessar estes dados.");
        acceptance = await repo.termsAcceptance(driverId);
      }
      res.status(200)
        .type("application/pdf")
        .set("Content-Disposition", 'attachment; filename="termos-rotau.pdf"')
        .set("Cache-Control", "private, no-store")
        .send(termsPdf(acceptance));
    } catch (error) { next(error); }
  });

  // Cadastro: cria a conta com senha e já deixa o usuário logado
  app.post("/api/students", route(async (req, res) => {
    const data = body(req) as Record<string, unknown>;
    if (String(data.email ?? "").toLowerCase().endsWith(`@${DEMO_VAN_DOMAIN}`)) throw new ApiError(400, "Use um e-mail real para criar a conta.");
    const passwordHash = await hashPassword(validatePassword(data.password));
    const student = await repo.createStudent({ ...data, passwordHash });
    await repo.locateStudent(student.id);
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
    if (data.acceptTerms === true) await repo.acceptTerms(driver.id);
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
  // Assinatura mensal do motorista (pagamento ainda simulado)
  app.get("/api/drivers/:id/subscription", route((req, res) => {
    const driverId = id(req.params.id);
    requireUser(res, "driver", driverId);
    return repo.subscription(driverId);
  }));
  app.post("/api/drivers/:id/subscription", route((req, res) => {
    const driverId = id(req.params.id);
    requireUser(res, "driver", driverId);
    return repo.subscribe(driverId);
  }, 200));
  // Aceite digital dos termos de segurança e conduta
  app.post("/api/drivers/:id/terms-acceptance", route((req, res) => {
    const driverId = id(req.params.id);
    requireUser(res, "driver", driverId);
    return repo.acceptTerms(driverId);
  }, 200));
  // Motorista inicia a ida ou a volta do dia (avisa quem vai hoje)
  app.post("/api/drivers/:id/route-runs", route((req, res) => {
    const driverId = id(req.params.id);
    requireUser(res, "driver", driverId);
    return repo.startRoute(driverId, body(req).leg);
  }));

  // Presença do dia: o estudante logado vê e diz se vai hoje
  app.get("/api/attendance/today", route(async (_req, res) => {
    const { id } = requireUser(res, "student");
    await repo.locateStudent(id);
    return repo.studentToday(id);
  }));
  app.put("/api/attendance/today", route((req, res) => repo.setAttendance(requireUser(res, "student").id, body(req).going)));

  // Avisos do sino do painel (estudante ou motorista logado)
  app.get("/api/notifications", route((_req, res) => repo.notifications(currentUser(res))));
  app.post("/api/notifications/read", route((_req, res) => repo.markNotificationsRead(currentUser(res)), 200));

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

  // Excluir a própria conta (estudante ou motorista): pede a senha de novo
  app.post("/api/account/delete", route(async (req, res) => {
    const user = currentUser(res);
    const { password } = body(req) as Record<string, unknown>;
    const key = `${req.ip}|delete|${user.profile}|${user.id}`;
    limiter.check(key);
    if (typeof password !== "string" || !(await verifyPassword(password, await repo.passwordHashOf(user)))) {
      limiter.fail(key);
      throw new ApiError(401, "Senha incorreta.");
    }
    limiter.reset(key);
    await repo.deleteAccount(user);
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

  // Página de uma van (estudante logado, só vans da faculdade dele)
  app.get("/api/vans/:id", route((req, res) => repo.vanDetail(id(req.params.id), requireUser(res, "student").id)));

  // Estudante reserva vaga para si mesmo, numa van só (replace: true troca a van atual por esta)
  app.post("/api/bookings", route((req, res) => {
    const student = requireUser(res, "student");
    const { driverId, replace } = body(req) as Record<string, unknown>;
    return repo.createBooking({ studentId: student.id, driverId: driverId as number, replace });
  }));
  // Estudante cancela a própria reserva
  app.post("/api/bookings/:id/cancel", route((req, res) => repo.cancelBooking(requireUser(res, "student").id, id(req.params.id)), 200));
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
  app.use("/api", handleError);

  return app;
}
