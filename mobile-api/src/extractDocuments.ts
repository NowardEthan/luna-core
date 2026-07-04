import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { z } from "zod";

export const ExtractDocumentsRequestSchema = z.object({
  files: z
    .array(
      z.object({
        fileBase64: z.string().min(16).max(20_000_000),
        mimeType: z.string().max(128).optional().default("application/octet-stream"),
        name: z.string().max(256).optional(),
      }),
    )
    .min(1)
    .max(5),
});

export type ExtractDocumentsRequest = z.infer<typeof ExtractDocumentsRequestSchema>;

export type ExtractedDocument = {
  name?: string;
  text: string;
  truncated?: boolean;
};

const MAX_FILE_BYTES = 12 * 1024 * 1024;
/** Extração completa (preview no telemóvel). O chat trunca antes do LLM. */
const MAX_TEXT_CHARS = 8_000;

const TEXT_EXTENSIONS = new Set([
  "md",
  "markdown",
  "txt",
  "json",
  "csv",
  "html",
  "htm",
  "xml",
  "log",
  "yaml",
  "yml",
]);

function extensionFromName(name?: string): string {
  if (!name) return "";
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

function resolveKind(name: string | undefined, mime: string): "pdf" | "docx" | "text" | "unsupported" {
  const ext = extensionFromName(name);
  const lowerMime = mime.toLowerCase();

  if (ext === "pdf" || lowerMime === "application/pdf") return "pdf";
  if (
    ext === "docx" ||
    lowerMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (ext === "doc" || lowerMime === "application/msword") return "unsupported";
  if (ext && TEXT_EXTENSIONS.has(ext)) return "text";
  if (lowerMime.startsWith("text/") || lowerMime === "application/json" || lowerMime === "application/xml") {
    return "text";
  }
  return "unsupported";
}

function truncateText(text: string): { text: string; truncated: boolean } {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= MAX_TEXT_CHARS) {
    return { text: normalized, truncated: false };
  }
  return {
    text: `${normalized.slice(0, MAX_TEXT_CHARS)}\n\n[... conteúdo truncado — arquivo muito longo ...]`,
    truncated: true,
  };
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? "";
}

function extractPlainText(buffer: Buffer): string {
  return buffer.toString("utf8");
}

function unsupportedMessage(name?: string, mime?: string): string {
  const label = name?.trim() || "arquivo";
  return `Formato não suportado para leitura automática (${label}, ${mime ?? "tipo desconhecido"}). ` +
    "Formatos suportados: PDF, DOCX, MD, TXT, JSON, CSV, HTML, XML, YAML.";
}

/** Extrai texto de documentos anexados (PDF, DOCX, texto). */
export async function extractDocuments(input: ExtractDocumentsRequest): Promise<ExtractedDocument[]> {
  const results: ExtractedDocument[] = [];

  for (const file of input.files) {
    const buffer = Buffer.from(file.fileBase64, "base64");
    if (buffer.length < 8) {
      throw new Error(`Arquivo ${file.name ?? "sem nome"} está vazio ou corrompido.`);
    }
    if (buffer.length > MAX_FILE_BYTES) {
      throw new Error(`Arquivo ${file.name ?? "sem nome"} é grande demais (máx. ~12 MB).`);
    }

    const kind = resolveKind(file.name, file.mimeType ?? "");
    let raw = "";

    switch (kind) {
      case "pdf":
        raw = await extractPdf(buffer);
        break;
      case "docx":
        raw = await extractDocx(buffer);
        break;
      case "text":
        raw = extractPlainText(buffer);
        break;
      default:
        raw = unsupportedMessage(file.name, file.mimeType);
        break;
    }

    if (!raw.trim() && kind !== "unsupported") {
      raw = `[Arquivo ${file.name ?? "sem nome"} sem texto legível extraível.]`;
    }

    const { text, truncated } = truncateText(raw);
    results.push({ name: file.name, text, truncated });
  }

  return results;
}

export function isDocumentExtractAvailable(): boolean {
  return true;
}
