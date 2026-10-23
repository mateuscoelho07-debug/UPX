// Função da Vercel: tudo o que não é arquivo estático (a API em /api/* e as páginas do
// Angular que não foram geradas no build) é atendido pelo servidor do Angular (src/server.ts).
export default async (req, res) => {
  const { reqHandler } = await import("../dist/rotau/server/server.mjs");
  return reqHandler(req, res);
};
