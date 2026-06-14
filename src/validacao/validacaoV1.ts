import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { avaliarMemoriaPorRegras } from "../memoria/avaliadorMemoriaRegras.js";
import { criarSessao, aplicarDecisaoMemoria } from "../memoria/gerenciadorSessao.js";
import type { AcaoMemoriaNeuronio, TipoMemoria } from "../memoria/esquemaMemoria.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// ─── Tipos de cenário V1 ──────────────────────────────────────────────────────

export type ExpectativaMemoria = {
  acao_memoria: AcaoMemoriaNeuronio;
  tipo_memoria?: TipoMemoria;
  fato_gravado_sem_confirmacao?: boolean;
  sugestao_resposta_presente?: boolean;
};

export type CenarioV1 = {
  id: string;
  nome: string;
  mensagem: string;
  categoria: string;
  sessao_com_pendencia?: boolean;
  expectativa: ExpectativaMemoria;
};

export type ResultadoValidacaoV1 = {
  id: string;
  nome: string;
  passou: boolean;
  falhas: string[];
  acao_obtida: AcaoMemoriaNeuronio;
  tipo_obtido?: TipoMemoria;
  e_sensivel: boolean;
};

export type RelatorioV1 = {
  versao: string;
  timestamp: string;
  suite_memoria: {
    total: number;
    passou: number;
    taxa_conformidade: number;
    vazamentos_sensiveis: number;
  };
  criterios_v1: {
    cenarios_json: boolean;
    zero_vazamento_sensivel: boolean;
    aprovado: boolean;
  };
  resultados: ResultadoValidacaoV1[];
};

// ─── Carregamento ─────────────────────────────────────────────────────────────

export function carregarCenariosV1(): CenarioV1[] {
  const caminho = join(RAIZ, "tests", "cenarios-v1.json");
  const bruto = JSON.parse(readFileSync(caminho, "utf-8")) as { cenarios: CenarioV1[] };
  return bruto.cenarios;
}

// ─── Validação de cenário individual ─────────────────────────────────────────

export function validarCenarioV1(cenario: CenarioV1): ResultadoValidacaoV1 {
  const falhas: string[] = [];

  // Monta sessão conforme o cenário pede
  const sessao = criarSessao();
  if (cenario.sessao_com_pendencia) {
    // Simula uma pendência ativa (dado sensível anterior ainda não confirmado)
    aplicarDecisaoMemoria(
      sessao,
      avaliarMemoriaPorRegras("Eu sou autista"),
    );
  }

  const decisao = avaliarMemoriaPorRegras(cenario.mensagem, sessao);
  const exp = cenario.expectativa;
  const eSensivel = exp.fato_gravado_sem_confirmacao === false &&
    (exp.acao_memoria === "confirmar" || exp.tipo_memoria === "informacao_sensivel");

  // Verifica ação
  if (decisao.acao !== exp.acao_memoria) {
    falhas.push(`acao_memoria: esperado "${exp.acao_memoria}", obteve "${decisao.acao}"`);
  }

  // Verifica tipo (quando especificado)
  if (exp.tipo_memoria && decisao.tipo !== exp.tipo_memoria) {
    falhas.push(`tipo_memoria: esperado "${exp.tipo_memoria}", obteve "${decisao.tipo}"`);
  }

  // Verifica que dado sensível NÃO foi gravado sem confirmação
  if (exp.fato_gravado_sem_confirmacao === false) {
    const sessaoTeste = criarSessao();
    if (cenario.sessao_com_pendencia) {
      aplicarDecisaoMemoria(sessaoTeste, avaliarMemoriaPorRegras("Eu sou autista"));
    }
    aplicarDecisaoMemoria(sessaoTeste, decisao);
    if (sessaoTeste.fatos.length > 0) {
      falhas.push(
        `VAZAMENTO: fato gravado sem confirmação explícita (${sessaoTeste.fatos.length} fato(s))`,
      );
    }
  }

  // Verifica sugestão de resposta presente quando esperada
  if (exp.sugestao_resposta_presente && !decisao.sugestao_resposta) {
    falhas.push("sugestao_resposta_presente: esperado sugestão de resposta, mas veio vazia");
  }

  return {
    id: cenario.id,
    nome: cenario.nome,
    passou: falhas.length === 0,
    falhas,
    acao_obtida: decisao.acao,
    tipo_obtido: decisao.tipo,
    e_sensivel: eSensivel,
  };
}

// ─── Suite completa ───────────────────────────────────────────────────────────

export function executarSuiteV1(cenarios: CenarioV1[]): ResultadoValidacaoV1[] {
  return cenarios.map(validarCenarioV1);
}

// ─── Relatório ────────────────────────────────────────────────────────────────

export function montarRelatorioV1(resultados: ResultadoValidacaoV1[]): RelatorioV1 {
  const total = resultados.length;
  const passou = resultados.filter((r) => r.passou).length;
  const vazamentos = resultados.filter(
    (r) => r.e_sensivel && r.falhas.some((f) => f.startsWith("VAZAMENTO")),
  ).length;

  const aprovado = passou === total && vazamentos === 0;

  return {
    versao: "1.0.0",
    timestamp: new Date().toISOString(),
    suite_memoria: {
      total,
      passou,
      taxa_conformidade: total > 0 ? passou / total : 0,
      vazamentos_sensiveis: vazamentos,
    },
    criterios_v1: {
      cenarios_json: total >= 5,
      zero_vazamento_sensivel: vazamentos === 0,
      aprovado,
    },
    resultados,
  };
}

export function salvarRelatorioV1(relatorio: RelatorioV1): { json: string; md: string } {
  const dirBase = join(process.cwd(), "logs", "validacao-v1");
  if (!existsSync(dirBase)) mkdirSync(dirBase, { recursive: true });

  const timestamp = relatorio.timestamp.replace(/[:.]/g, "-").slice(0, 19);
  const pathJson = join(dirBase, `relatorio-v1-${timestamp}.json`);
  const pathMd = join(dirBase, `relatorio-v1-${timestamp}.md`);

  writeFileSync(pathJson, JSON.stringify(relatorio, null, 2), "utf-8");
  writeFileSync(pathMd, gerarMarkdownV1(relatorio), "utf-8");

  return { json: pathJson, md: pathMd };
}

function gerarMarkdownV1(r: RelatorioV1): string {
  const s = r.suite_memoria;
  const c = r.criterios_v1;
  const taxa = (s.taxa_conformidade * 100).toFixed(0);
  const iconeGeral = c.aprovado ? "✅" : "❌";

  const linhas: string[] = [
    `# Luna Core — Relatório de Validação V1`,
    ``,
    `**Timestamp:** ${r.timestamp}  `,
    `**Versão:** ${r.versao}  `,
    `**Resultado:** ${iconeGeral} ${c.aprovado ? "APROVADO" : "REPROVADO"}`,
    ``,
    `## Suite de Memória`,
    ``,
    `| Métrica | Valor |`,
    `| --- | --- |`,
    `| Total de cenários | ${s.total} |`,
    `| Passaram | ${s.passou} |`,
    `| Taxa de conformidade | ${taxa}% |`,
    `| Vazamentos de dado sensível | ${s.vazamentos_sensiveis} |`,
    ``,
    `## Critérios V1`,
    ``,
    `| Critério | Status |`,
    `| --- | --- |`,
    `| Cenários JSON (≥ 5) | ${c.cenarios_json ? "✅" : "❌"} |`,
    `| Zero vazamento sensível | ${c.zero_vazamento_sensivel ? "✅" : "❌"} |`,
    `| **Aprovado** | ${c.aprovado ? "✅" : "❌"} |`,
    ``,
    `## Resultados por cenário`,
    ``,
  ];

  for (const res of r.resultados) {
    const icone = res.passou ? "✅" : "❌";
    linhas.push(`### ${icone} ${res.id} — ${res.nome}`);
    linhas.push(`- Ação obtida: \`${res.acao_obtida}\``);
    if (res.tipo_obtido) linhas.push(`- Tipo obtido: \`${res.tipo_obtido}\``);
    if (!res.passou) {
      linhas.push(`- **Falhas:**`);
      for (const f of res.falhas) linhas.push(`  - ${f}`);
    }
    linhas.push(``);
  }

  return linhas.join("\n");
}
