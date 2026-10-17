export type SerializedLunaError = {
  code: string;
  message: string;
  retryable: boolean;
};

type ErroComCampos = {
  code?: unknown;
  message?: unknown;
  retryable?: unknown;
  status?: unknown;
};

function camposErro(erro: unknown): ErroComCampos {
  return erro && typeof erro === "object" ? (erro as ErroComCampos) : {};
}

/** Converte qualquer falha em um contrato pequeno, previsível e serializável. */
export function normalizarLunaError(erro: unknown): SerializedLunaError {
  const campos = camposErro(erro);
  const messageBruta =
    erro instanceof Error
      ? erro.message
      : typeof campos.message === "string"
        ? campos.message
        : typeof erro === "string"
          ? erro
          : "";
  const message = messageBruta.trim() || "Erro desconhecido na Luna.";
  const texto = message.toLowerCase();
  const status = typeof campos.status === "number" ? campos.status : undefined;

  let code = typeof campos.code === "string" && campos.code.trim()
    ? campos.code.trim()
    : "LUNA_UNKNOWN";
  let retryable = typeof campos.retryable === "boolean" ? campos.retryable : false;

  if (code === "LUNA_UNKNOWN") {
    if (/abort|cancelad/.test(texto)) code = "LUNA_ABORTED";
    else if (/timeout|timed out/.test(texto)) code = "LUNA_TIMEOUT";
    else if (status === 429 || /rate.?limit|limite de pedidos/.test(texto)) {
      code = "LUNA_RATE_LIMITED";
    } else if (status === 401 || status === 403 || /unauthor|autentica|api key/.test(texto)) {
      code = "LUNA_AUTH";
    } else if (/fetch failed|econn|dns|rede|network|indisponível/.test(texto)) {
      code = "LUNA_NETWORK";
    }
  }

  if (typeof campos.retryable !== "boolean") {
    retryable =
      code === "LUNA_TIMEOUT" ||
      code === "LUNA_RATE_LIMITED" ||
      code === "LUNA_NETWORK" ||
      (status !== undefined && status >= 500);
  }

  return { code, message, retryable };
}
