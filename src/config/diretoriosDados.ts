import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ_PACOTE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RAIZ_DADOS_PADRAO = join(RAIZ_PACOTE, "logs");

export type ConfigDiretoriosDados = {
  /** Diretório-base. Os demais caminhos herdam dele quando omitidos. */
  raiz?: string;
  sessoes?: string;
  sqlite?: string;
  modelos?: string;
  presenca?: string;
  logs?: string;
};

export type DiretoriosDados = Required<ConfigDiretoriosDados>;

let configuracao: DiretoriosDados | null = null;
let emUso = false;

function absoluto(caminho: string): string {
  return isAbsolute(caminho) ? caminho : resolve(caminho);
}

function criarConfiguracao(opcoes: ConfigDiretoriosDados = {}): DiretoriosDados {
  const raiz = absoluto(opcoes.raiz ?? RAIZ_DADOS_PADRAO);
  const sqlite = opcoes.sqlite
    ?? (opcoes.raiz ? join(raiz, "memoria.db") : process.env.LUNA_DB_PATH?.trim())
    ?? join(raiz, "memoria.db");
  return {
    raiz,
    sessoes: absoluto(opcoes.sessoes ?? join(raiz, "sessoes")),
    sqlite: absoluto(sqlite),
    modelos: absoluto(opcoes.modelos ?? join(raiz, "modelos")),
    presenca: absoluto(opcoes.presenca ?? join(raiz, "presenca")),
    logs: absoluto(opcoes.logs ?? join(raiz, "interacoes")),
  };
}

/**
 * Define todos os caminhos persistentes usados pelo desktop.
 * Deve ser chamada antes da primeira operação de sessão, memória ou presença.
 */
export function configurarDiretoriosDados(opcoes: ConfigDiretoriosDados): DiretoriosDados {
  if (emUso) {
    throw new Error(
      "Diretórios de dados já estão em uso; configure-os antes da primeira execução.",
    );
  }
  configuracao = criarConfiguracao(opcoes);
  return { ...configuracao };
}

/** Resolve os caminhos atuais e os congela para esta instância do processo. */
export function obterDiretoriosDados(): DiretoriosDados {
  configuracao ??= criarConfiguracao();
  emUso = true;
  return configuracao;
}

/** Defaults históricos, mantidos para consumidores que apenas exibem caminhos. */
export const DIRETORIOS_DADOS_PADRAO: DiretoriosDados = criarConfiguracao({
  raiz: RAIZ_DADOS_PADRAO,
  sqlite: join(RAIZ_DADOS_PADRAO, "memoria.db"),
});
