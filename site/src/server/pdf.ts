// Gerador de PDF mínimo (só texto), sem dependências e sem serviço pago: roda no servidor da Vercel.
// Usa as fontes padrão Helvetica e Helvetica-Bold (acentos do português via WinAnsi) e quebra as linhas sozinho.
export type PdfBlock =
  | { kind: "title" | "heading" | "paragraph" | "bullet" | "label"; text: string }
  | { kind: "space"; size?: number }
  // se sobrar menos que `height` na página, o que vem a seguir começa na próxima (mantém um bloco junto)
  | { kind: "keep"; height: number };

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const BODY_SIZE = 10.5;

// Larguras da Helvetica (por mil de corpo) para os caracteres ASCII 32 a 126
const WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

// Caracteres fora do Latin-1 que existem no WinAnsi (código do PDF)
const WIN_ANSI_EXTRA: Record<string, number> = { "•": 0x95, "–": 0x96, "—": 0x97, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "…": 0x85 };

function charWidth(char: string, bold: boolean): number {
  const base = char.normalize("NFD")[0]!;
  const code = base.charCodeAt(0);
  const width = code >= 32 && code <= 126 ? WIDTHS[code - 32]! : char in WIN_ANSI_EXTRA ? (char === "•" ? 350 : 556) : 556;
  return bold ? width * 1.07 : width;
}

function textWidth(text: string, size: number, bold: boolean): number {
  let total = 0;
  for (const char of text) total += charWidth(char, bold);
  return (total * size) / 1000;
}

// Texto -> string literal do PDF: ASCII puro, o resto em escapes octais (Latin-1 / WinAnsi)
function pdfString(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (char === "(" || char === ")" || char === "\\") out += `\\${char}`;
    else if (code >= 32 && code <= 126) out += char;
    else if (char in WIN_ANSI_EXTRA) out += `\\${WIN_ANSI_EXTRA[char]!.toString(8)}`;
    else if (code >= 160 && code <= 255) out += `\\${code.toString(8)}`;
    else out += "?";
  }
  return out;
}

function wrap(text: string, size: number, bold: boolean, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && textWidth(candidate, size, bold) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

type Placed = { x: number; y: number; size: number; bold: boolean; text: string };

// Monta o PDF (A4). `footer` aparece em todas as páginas, junto com "Página n de N".
export function buildPdf(blocks: PdfBlock[], footer: string, title: string): Buffer {
  const pages: Placed[][] = [[]];
  let y = PAGE_HEIGHT - MARGIN;
  const bottom = MARGIN + 18;
  // escreve as linhas (passando para a próxima página quando acaba o espaço) e devolve onde caiu a primeira
  const place = (lines: string[], opts: { x: number; size: number; bold: boolean; gap: number; before: number }) => {
    const lineHeight = opts.size * 1.4;
    let first: { page: Placed[]; y: number } | null = null;
    y -= opts.before;
    for (const text of lines) {
      if (y - lineHeight < bottom) {
        pages.push([]);
        y = PAGE_HEIGHT - MARGIN;
      }
      y -= lineHeight;
      pages.at(-1)!.push({ x: opts.x, y, size: opts.size, bold: opts.bold, text });
      first ??= { page: pages.at(-1)!, y };
    }
    y -= opts.gap;
    return first;
  };

  for (const block of blocks) {
    if (block.kind === "space") {
      y -= block.size ?? 8;
    } else if (block.kind === "keep") {
      if (y - block.height < bottom) {
        pages.push([]);
        y = PAGE_HEIGHT - MARGIN;
      }
    } else if (block.kind === "title") {
      place(wrap(block.text, 20, true, PAGE_WIDTH - 2 * MARGIN), { x: MARGIN, size: 20, bold: true, gap: 6, before: 0 });
    } else if (block.kind === "heading") {
      // título de seção nunca fica sozinho no fim da página
      if (y - 70 < bottom) {
        pages.push([]);
        y = PAGE_HEIGHT - MARGIN;
      }
      place(wrap(block.text, 13, true, PAGE_WIDTH - 2 * MARGIN), { x: MARGIN, size: 13, bold: true, gap: 4, before: 10 });
    } else if (block.kind === "label") {
      place(wrap(block.text, BODY_SIZE, true, PAGE_WIDTH - 2 * MARGIN), { x: MARGIN, size: BODY_SIZE, bold: true, gap: 2, before: 0 });
    } else if (block.kind === "bullet") {
      const lines = wrap(block.text, BODY_SIZE, false, PAGE_WIDTH - 2 * MARGIN - 16);
      const first = place(lines, { x: MARGIN + 16, size: BODY_SIZE, bold: false, gap: 3, before: 0 });
      first?.page.push({ x: MARGIN + 3, y: first.y, size: BODY_SIZE, bold: false, text: "•" });
    } else {
      place(wrap(block.text, BODY_SIZE, false, PAGE_WIDTH - 2 * MARGIN), { x: MARGIN, size: BODY_SIZE, bold: false, gap: 5, before: 0 });
    }
  }

  // objetos: 1 catálogo, 2 páginas, 3 e 4 fontes, 5 informações, depois (página, conteúdo) de cada página
  const objects: string[] = [];
  const firstPageObject = 6;
  const kids = pages.map((_, i) => `${firstPageObject + i * 2} 0 R`).join(" ");
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  objects[5] = `<< /Title (${pdfString(title)}) /Producer (RotaU) >>`;
  for (const [index, page] of pages.entries()) {
    const pageNumber = firstPageObject + index * 2;
    const footerText = `${footer}  |  Página ${index + 1} de ${pages.length}`;
    const all: Placed[] = [...page, { x: MARGIN, y: MARGIN - 8, size: 8.5, bold: false, text: footerText }];
    const content = all
      .map((p) => `BT /${p.bold ? "F2" : "F1"} ${p.size} Tf ${p.x.toFixed(2)} ${p.y.toFixed(2)} Td (${pdfString(p.text)}) Tj ET`)
      .join("\n");
    objects[pageNumber] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageNumber + 1} 0 R >>`;
    objects[pageNumber + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  }

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // todo o texto é ASCII (acentos viram escapes octais), então 1 caractere = 1 byte
  return Buffer.from(out, "latin1");
}
