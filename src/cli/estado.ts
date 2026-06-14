import "../carregarEnv.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { analisarContextoPorRegras } from "../analyzers/analisadorContextoRegras.js";
import { calcularEstadoInterno } from "../estado/calculadorEstadoInterno.js";
import { carregarSessao } from "../memoria/storeSessao.js";
import { PASTA_SESSOES } from "../memoria/storeSessao.js";

function barra(valor: number, largura = 20): string {
  const preenchido = Math.round(valor * largura);
  return "█".repeat(preenchido) + "░".repeat(largura - preenchido);
}

function rotulo(v: number): string {
  if (v >= 0.8) return "ALTO";
  if (v >= 0.5) return "MÉDIO";
  if (v >= 0.2) return "BAIXO";
  return "MÍNIMO";
}

async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════╗");
  console.log("║   Luna Core — Estado Interno V2.1    ║");
  console.log("╚══════════════════════════════════════╝\n");

  const pathUltima = join(PASTA_SESSOES, ".ultima-sessao");
  const sessaoId = existsSync(pathUltima)
    ? readFileSync(pathUltima, "utf-8").trim()
    : null;

  const mensagem = process.argv.slice(2).join(" ") || "como você está?";

  const sessao = sessaoId ? carregarSessao(sessaoId) : null;

  if (sessao) {
    console.log(`Sessão: ${sessao.id}`);
    console.log(`Turnos: ${sessao.mensagens.length} · Fatos: ${sessao.fatos.length} · Pendência: ${sessao.pendente_confirmacao ? "sim" : "não"}`);
  } else {
    console.log("Sessão: nova (sem histórico)");
  }

  const analise = analisarContextoPorRegras(mensagem);
  const estado = calcularEstadoInterno(
    analise,
    sessao ?? { id: "debug", criada_em: "", atualizada_em: "", mensagens: [], fatos: [], preferencias: {} },
    sessao?.contexto_acumulado,
  );

  console.log(`\nMensagem: "${mensagem}"`);
  console.log(`Análise:  intenção=${analise.intencao} · risco=${analise.nivel_risco} · confiança=${analise.confianca.toFixed(2)}\n`);

  console.log("─── Estado Interno ─────────────────────────────");
  console.log(`  engajamento  ${barra(estado.engajamento)} ${(estado.engajamento * 100).toFixed(0).padStart(3)}%  ${rotulo(estado.engajamento)}`);
  console.log(`  incerteza    ${barra(estado.incerteza)}  ${(estado.incerteza * 100).toFixed(0).padStart(3)}%  ${rotulo(estado.incerteza)}`);
  console.log(`  atencao      ${barra(estado.atencao)}  ${(estado.atencao * 100).toFixed(0).padStart(3)}%  ${rotulo(estado.atencao)}`);
  console.log(`  alerta_risco ${barra(estado.alerta_risco)} ${(estado.alerta_risco * 100).toFixed(0).padStart(3)}%  ${rotulo(estado.alerta_risco)}`);
  console.log("────────────────────────────────────────────────");

  if (estado.alerta_risco >= 0.7) {
    console.log("\n⚠ Modo alerta ativo — segurancaEvaluator em threshold elevado");
  }
  if (estado.incerteza >= 0.7) {
    console.log("⚠ Alta incerteza — considera pedir clarificação");
  }
  if (sessao?.estado_interno) {
    console.log("\n▸ Estado persistido na sessão:", JSON.stringify(sessao.estado_interno, null, 2));
  }
}

main().catch((e: unknown) => {
  console.error("Erro:", e instanceof Error ? e.message : e);
  process.exit(1);
});
