// API REST do RotaU. Rode com `pnpm server` (porta 3001 por padrão).
import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ApiError, openDatabase } from "./db.js";

export function createApp(repo = openDatabase()) {
  const app = express();
  app.use(express.json());

  const route = (handler) => (req, res, next) => {
    try {
      const result = handler(req);
      res.status(req.method === "POST" ? 201 : 200).json(result);
    } catch (error) {
      next(error);
    }
  };
  const id = (value) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new ApiError(400, "Identificador inválido.");
    return parsed;
  };

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/colleges", route(() => repo.listColleges()));
  app.post("/api/searches", route((req) => repo.searchRoutes(req.body)));

  app.post("/api/students", route((req) => repo.createStudent(req.body)));
  app.get("/api/students/:id", route((req) => repo.getStudent(id(req.params.id))));

  app.post("/api/drivers", route((req) => repo.createDriver(req.body)));
  app.get("/api/drivers/:id", route((req) => repo.getDriver(id(req.params.id))));
  app.get("/api/drivers/:id/dashboard", route((req) => repo.driverDashboard(id(req.params.id))));

  app.get("/api/vans", route((req) => repo.listVans({
    studentId: req.query.studentId ? id(req.query.studentId) : undefined,
    college: req.query.college,
  })));

  app.post("/api/bookings", route((req) => repo.createBooking(req.body)));
  app.patch("/api/bookings/:id", route((req) => repo.updateBooking(id(req.params.id), req.body)));

  app.use("/api", (_req, res) => res.status(404).json({ error: "Rota não encontrada." }));

  // Em produção, a mesma API serve o front end já compilado (pnpm build)
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  app.use((error, _req, res, _next) => {
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
    if (error instanceof SyntaxError) return res.status(400).json({ error: "JSON inválido." });
    console.error(error);
    res.status(500).json({ error: "Erro interno do servidor." });
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.API_PORT ?? 3001);
  createApp().listen(port, () => console.log(`API do RotaU rodando em http://localhost:${port}`));
}
