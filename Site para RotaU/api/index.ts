// Função da Vercel: todas as chamadas /api/* chegam aqui (veja vercel.json)
// e são atendidas pela mesma API Express usada em desenvolvimento.
import { createApp } from "../server/index.ts";

export default createApp();
