import type { MemoriaSessaoMobile } from "./typesMemoriaMobile.js";

/** Texto máximo por arquivo dentro do turno enviado ao LLM. */
export const MAX_ATTACHMENT_TEXT_IN_CHAT = 2_000;

/** Tamanho máximo do turno do utilizador (pergunta + bloco [Anexos]). */
export const MAX_MOBILE_USER_MESSAGE_CHARS = 5_500;

/** Histórico compacto — cada mensagem guardada na sessão mobile. */
export const MAX_HISTORICO_MSG_CHARS = 1_200;

const TRUNCATE_DOC_NOTICE =
  "\n\n[… parte do arquivo omitida — é longo demais para o modelo de uma vez; " +
  "pergunte sobre um trecho específico ou use «Referenciar trecho» no visualizador …]";

const TRUNCATE_MSG_NOTICE =
  "\n\n[… mensagem truncada por limite do modelo Groq …]";

export function truncateAttachmentTextForChat(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= MAX_ATTACHMENT_TEXT_IN_CHAT) return normalized;
  return `${normalized.slice(0, MAX_ATTACHMENT_TEXT_IN_CHAT)}${TRUNCATE_DOC_NOTICE}`;
}

/** Encolhe blocos [Anexos] antes de mandar ao pipeline Luna. */
export function truncateMobileChatMessage(
  message: string,
  options?: { maxChars?: number },
): string {
  const maxChars = options?.maxChars ?? MAX_MOBILE_USER_MESSAGE_CHARS;
  let result = shrinkAttachmentBlocks(message);

  if (result.length <= maxChars) return result;
  const notice =
    maxChars <= MAX_MOBILE_USER_MESSAGE_CHARS
      ? TRUNCATE_MSG_NOTICE
      : "\n\n[… mensagem truncada por limite de segurança …]";
  return `${result.slice(0, maxChars)}${notice}`;
}

function shrinkAttachmentBlocks(message: string): string {
  const marker = "  Conteúdo do arquivo:\n";
  let idx = 0;
  let out = "";

  while (idx < message.length) {
    const start = message.indexOf(marker, idx);
    if (start === -1) {
      out += message.slice(idx);
      break;
    }
    out += message.slice(idx, start + marker.length);

    let pos = start + marker.length;
    let body = "";
    while (pos < message.length) {
      const lineEnd = message.indexOf("\n", pos);
      const line = lineEnd === -1 ? message.slice(pos) : message.slice(pos, lineEnd + 1);
      if (line.startsWith("    ") || (line.trim() === "" && body.length > 0)) {
        body += line.startsWith("    ") ? line.slice(4) : line;
        pos = lineEnd === -1 ? message.length : lineEnd + 1;
        continue;
      }
      break;
    }

    const trimmed = truncateAttachmentTextForChat(body);
    out += trimmed
      .split("\n")
      .map((line) => `    ${line}`)
      .join("\n");
    idx = pos;
  }

  return out;
}

/** Evita que turnos antigos com PDF inteiro estourem o TPM em conversas longas. */
export function compactarSessaoMobile(sessao: MemoriaSessaoMobile): void {
  if (sessao.mensagens.length > 8) {
    sessao.mensagens = sessao.mensagens.slice(-8);
  }
  for (const msg of sessao.mensagens) {
    if (msg.conteudo.length <= MAX_HISTORICO_MSG_CHARS) continue;
    msg.conteudo = `${msg.conteudo.slice(0, MAX_HISTORICO_MSG_CHARS)}\n[…]`;
  }
}
