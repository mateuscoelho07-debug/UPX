// Servidor do RotaU (Angular SSR + Express): atende a API (/api/*) e entrega as páginas do Angular.
// No computador roda com `pnpm dev`; na Vercel, a função api/index.js chama o reqHandler daqui.
import { AngularNodeAppEngine, createNodeRequestHandler, isMainModule, writeResponseToNodeResponse } from "@angular/ssr/node";
import express from "express";
import { join } from "node:path";
import { createApp } from "./server/api.ts";

const browserDistFolder = join(import.meta.dirname, "../browser");

const app = express();
app.disable("x-powered-by");
const angularApp = new AngularNodeAppEngine();

// API do RotaU (banco no Turso ou arquivo local)
app.use(createApp());

// Arquivos estáticos do site já compilado (na Vercel quem serve é a própria Vercel)
app.use(express.static(browserDistFolder, { maxAge: "1y", index: false, redirect: false }));

// Demais endereços: páginas do Angular
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

if (isMainModule(import.meta.url) || process.env["pm_id"]) {
  const port = Number(process.env["PORT"] ?? 3001);
  app.listen(port, (error) => {
    if (error) throw error;
    console.log(`RotaU rodando em http://localhost:${port}`);
  });
}

// Usado pelo `ng serve`, pelo build e pela função da Vercel
export const reqHandler = createNodeRequestHandler(app);
