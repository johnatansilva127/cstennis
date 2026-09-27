import "server-only";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import sharp from "sharp";

export const MAX_PROOF_BYTES = 10 * 1024 * 1024;
export type ProofType = "jpeg" | "png" | "pdf";
export const PROOF_MIME: Record<ProofType, string> = { jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf" };

export type ValidationResult =
  | { ok: true; type: ProofType; mime: string; size: number; sha256: string; width?: number; height?: number }
  | { ok: false; reason: string; code: string };

/** Detecta o tipo pela assinatura real dos bytes (não pelo content-type/nome). */
export function detectType(bytes: Uint8Array): ProofType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "png";
  if (bytes.length >= 8 && Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-") return "pdf";
  return null;
}

export function extensionMatches(fileName: string | undefined, type: ProofType): boolean {
  if (!fileName) return true;
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (!ext || ext === fileName.toLowerCase()) return true;
  return type === "jpeg" ? ext === "jpg" || ext === "jpeg" : ext === type;
}

// Recursos ativos que não devem existir em um comprovante bancário.
const PDF_ACTIVE_TOKENS = ["/JavaScript", "/JS", "/Launch", "/EmbeddedFile", "/RichMedia", "/XFA", "/SubmitForm", "/ImportData"];

function containsActivePdfContent(text: string): string | null {
  for (const token of PDF_ACTIVE_TOKENS) {
    const re = new RegExp(`${token.replace("/", "\\/")}(?![A-Za-z])`);
    if (re.test(text)) return token;
  }
  return null;
}

/**
 * Verificação estrutural de PDF: cabeçalho, marcador final e ausência de
 * JavaScript/ações/anexos, inclusive dentro de streams comprimidos (Flate).
 * Heurística de defesa em profundidade: PDFs também são entregues só como
 * anexo, em outro domínio (storage), e passam pelo antimalware.
 */
export function inspectPdf(bytes: Buffer): string | null {
  const head = bytes.subarray(0, 1024).toString("latin1");
  if (!/^%PDF-[12]\.\d/.test(head)) return "Cabeçalho de PDF inválido.";
  const tail = bytes.subarray(Math.max(0, bytes.length - 2048)).toString("latin1");
  if (!tail.includes("%%EOF")) return "PDF incompleto ou corrompido.";
  const text = bytes.toString("latin1");
  if (/\/Encrypt(?![A-Za-z])/.test(text)) return "PDF protegido por senha não é aceito. Envie uma imagem ou PDF sem senha.";
  const direct = containsActivePdfContent(text);
  if (direct) return "O PDF contém conteúdo ativo não permitido.";
  let inflatedTotal = 0;
  const streamRe = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(text))) {
    const start = m.index + m[0].length;
    const end = text.indexOf("endstream", start);
    if (end < 0) break;
    const raw = bytes.subarray(start, end);
    try {
      const inflated = inflateSync(raw, { maxOutputLength: 20 * 1024 * 1024 });
      inflatedTotal += inflated.length;
      if (inflatedTotal > 60 * 1024 * 1024) return "PDF excede o limite de descompressão.";
      if (containsActivePdfContent(inflated.toString("latin1"))) return "O PDF contém conteúdo ativo não permitido.";
    } catch {
      // Stream não comprimido com Flate (ex.: imagem JPEG embutida): ignorado.
    }
    streamRe.lastIndex = end;
  }
  return null;
}

export async function validateProof(bytes: Buffer, fileName?: string): Promise<ValidationResult> {
  if (bytes.length === 0) return { ok: false, code: "empty", reason: "Arquivo vazio." };
  if (bytes.length > MAX_PROOF_BYTES) return { ok: false, code: "too_large", reason: "Arquivo maior que 10 MB." };
  const type = detectType(bytes);
  if (!type) return { ok: false, code: "type", reason: "Tipo de arquivo não aceito. Envie JPEG, PNG ou PDF." };
  if (!extensionMatches(fileName, type)) {
    return { ok: false, code: "extension", reason: "A extensão do arquivo não corresponde ao conteúdo." };
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  if (type === "pdf") {
    const problem = inspectPdf(bytes);
    if (problem) return { ok: false, code: "pdf", reason: problem };
    return { ok: true, type, mime: PROOF_MIME.pdf, size: bytes.length, sha256 };
  }

  try {
    const image = sharp(bytes, { failOn: "truncated", limitInputPixels: 50_000_000 });
    const meta = await image.metadata();
    if (meta.format !== (type === "jpeg" ? "jpeg" : "png")) {
      return { ok: false, code: "type", reason: "Conteúdo da imagem inconsistente." };
    }
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < 1 || height < 1 || width > 12000 || height > 12000) {
      return { ok: false, code: "dimensions", reason: "Dimensões da imagem fora do permitido." };
    }
    // Decodifica a imagem inteira para detectar arquivos corrompidos.
    await image.stats();
    return { ok: true, type, mime: PROOF_MIME[type], size: bytes.length, sha256, width, height };
  } catch {
    return { ok: false, code: "corrupt", reason: "Imagem corrompida ou ilegível." };
  }
}
