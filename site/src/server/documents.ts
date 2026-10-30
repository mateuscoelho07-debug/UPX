// Documentos do motorista (CNH e CRLV): validação do arquivo enviado.
// O conteúdo nunca vai para log nem para o painel de administração; só o próprio motorista baixa.
import { ApiError } from "./errors.ts";

export const DOCUMENT_KINDS = ["cnh", "crlv"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const DOCUMENT_LABELS: Record<DocumentKind, string> = { cnh: "CNH", crlv: "CRLV" };

export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024; // 2 MB por arquivo
export const MAX_DOCUMENT_JSON = "3mb"; // o arquivo vai em base64 (cerca de 4/3 maior)

export type DocumentMime = "image/jpeg" | "image/png" | "application/pdf";

export function documentKind(value: unknown): DocumentKind {
  if (!DOCUMENT_KINDS.includes(value as DocumentKind)) throw new ApiError(404, "Documento não encontrado.");
  return value as DocumentKind;
}

// O tipo vem do conteúdo (primeiros bytes), não do que o navegador diz: só JPG, PNG e PDF
function detectMime(bytes: Buffer): DocumentMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  return null;
}

export function readUpload(input: { filename?: unknown; data?: unknown }): { filename: string; mime: DocumentMime; bytes: Buffer } {
  if (typeof input.data !== "string" || input.data === "" || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.data)) {
    throw new ApiError(400, "Escolha um arquivo para enviar.");
  }
  const bytes = Buffer.from(input.data, "base64");
  if (bytes.length === 0) throw new ApiError(400, "O arquivo está vazio.");
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new ApiError(413, "O arquivo é grande demais. O limite é 2 MB.");
  const mime = detectMime(bytes);
  if (!mime) throw new ApiError(415, "Envie o documento em JPG, PNG ou PDF.");
  // o nome serve só para o motorista reconhecer o arquivo: sem pasta e sem caracteres de controle
  const name = String(input.filename ?? "").split(/[\\/]/).pop()!.replace(/[\u0000-\u001f"<>]/g, "").trim().slice(0, 80);
  return { filename: name || "documento", mime, bytes };
}
