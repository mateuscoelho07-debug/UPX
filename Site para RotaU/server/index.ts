// API REST do RotaU. Rode com `pnpm api` (porta 3001 por padrão).
import express, { type ErrorRequestHandler, type Request, type RequestHandler } from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ApiError, openDatabase, type Repository } from "./db.ts";

export function createApp(repo: Repository = openDatabase()) {
  const app = express();
  app.use(express.json());

  const route = (handler: (req: Request) => unknown): RequestHandler => (req, res, next) => {
    try {
      const result = handler(req);
      res.status(req.method === "POST" ? 201 : 200).json(result);
    } catch (error) {
      next(error);
    }
  };
  const id = (value: unknown): number => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new ApiError(400, "Identificador inválido.");
    return parsed;
  };
  const body = (req: Request) => (req.body ?? {}) as Record<string, never>;

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/api/colleges", route(() => repo.listColleges()));
  app.post("/api/searches", route((req) => repo.searchRoutes(body(req))));

  app.post("/api/students", route((req) => repo.createStudent(body(req))));
  app.get("/api/students/:id", route((req) => repo.getStudent(id(req.params.id))));

  app.post("/api/drivers", route((req) => repo.createDriver(body(req))));
  app.get("/api/drivers/:id", route((req) => repo.getDriver(id(req.params.id))));
  app.get("/api/drivers/:id/dashboard", route((req) => repo.driverDashboard(id(req.params.id))));

  app.get("/api/vans", route((req) => repo.listVans({
    studentId: req.query.studentId ? id(req.query.studentId) : undefined,
    college: typeof req.query.college === "string" ? req.query.college : undefined,
  })));

  app.post("/api/bookings", route((req) => repo.createBooking(body(req))));
  app.patch("/api/bookings/:id", route((req) => repo.updateBooking(id(req.params.id), body(req))));

  // Página de administração: somente leitura, pensada para uso local.
  // ATENÇÃO: ainda não há login. Antes de publicar o site, defina ADMIN_TOKEN
  // (o painel passa a exigir o token) ou implemente autenticação de verdade.
  const adminToken = process.env.ADMIN_TOKEN;
  app.get("/api/admin/overview", (req, res, next) => {
    if (adminToken && req.get("x-admin-token") !== adminToken) {
      res.status(401).json({ error: "Token de administrador inválido." });
      return;
    }
    route(() => ({ ...repo.adminOverview(), protected: Boolean(adminToken) }))(req, res, next);
  });

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
