/**
 * CLI de debug de presença — V2.3
 * Uso: npm run presenca [ambiente]
 *   npm run presenca              → mostra estado atual
 *   npm run presenca "desktop"    → simula solicitação do ambiente desktop
 */

import { obterEstado, entrar, sair, atualizarAtividade } from "../presenca/gerenciadorPresenca.js";
import { avaliarPresenca } from "../presenca/avaliadorPresenca.js";
import { obterFila, enfileirar } from "../presenca/filaPresenca.js";
import type { Ambiente } from "../presenca/esquemaPresenca.js";

const VERDE = "\x1b[32m";
const AMARELO = "\x1b[33m";
const AZUL = "\x1b[34m";
const CINZA = "\x1b[90m";
const B = "\x1b[1m";
const X = "\x1b[0m";

function statusIcon(status: string): string {
  switch (status) {
    case "presente": return `${VERDE}●${X}`;
    case "ausente": return `${CINZA}○${X}`;
    case "transicao": return `${AMARELO}◑${X}`;
    case "recado_pendente": return `${AMARELO}◎${X}`;
    default: return "?";
  }
}

function decisaoIcon(decisao: string): string {
  switch (decisao) {
    case "permanecer": return `${VERDE}→ permanecer${X}`;
    case "transitar": return `${AZUL}⇒ transitar${X}`;
    case "recado": return `${AMARELO}✉ recado${X}`;
    default: return decisao;
  }
}

function segundosDesde(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  return `${Math.floor(diff / 3600)}h atrás`;
}

// ─── Setup de demonstração ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const ambienteSolicitante = args[0] as Ambiente | undefined;

// Para demo, colocar Luna em conversa ativa no chat_cli
entrar("chat_cli");
atualizarAtividade("conversa_ativa");

const estado = obterEstado();

// ─── Exibição ─────────────────────────────────────────────────────────────────

console.log(`\n${B}╔════════════════════════════════════════╗`);
console.log(`║    Luna Core — Estado de Presença V2.3  ║`);
console.log(`╚════════════════════════════════════════╝${X}\n`);

console.log(`  ${statusIcon(estado.status)}  ${B}${estado.ambiente}${X}  ${CINZA}(${estado.status})${X}`);
console.log(`  ${CINZA}atividade:${X}  ${estado.atividade}`);
console.log(`  ${CINZA}desde:${X}     ${segundosDesde(estado.timestamp_entrada)}`);
if (estado.sessao_id) console.log(`  ${CINZA}sessão:${X}    ${estado.sessao_id.slice(0, 8)}…`);
if (estado.recado) console.log(`  ${AMARELO}recado:${X}    ${estado.recado}`);

// Mostrar a fila de chamadas
const fila = obterFila();
if (fila.length > 0) {
  console.log(`\n  ${B}Fila de Presença:${X}`);
  fila.forEach((s, i) => {
    const prioStr = s.prioridade === "urgente" ? `${AMARELO}[URGENTE]${X}` : `${CINZA}[NORMAL]${X}`;
    console.log(`    ${i + 1}. ${prioStr} ${s.ambiente} ${CINZA}(${segundosDesde(s.timestamp)})${X}`);
  });
} else {
  console.log(`\n  ${CINZA}Fila de Presença: (vazia)${X}`);
}

// ─── Avaliação de solicitação (se houver argumento) ───────────────────────────

if (ambienteSolicitante) {
  const resultado = avaliarPresenca(estado, {
    ambiente_solicitante: ambienteSolicitante,
    prioridade: "normal",
  });
  const resultadoUrgente = avaliarPresenca(estado, {
    ambiente_solicitante: ambienteSolicitante,
    prioridade: "urgente",
  });

  console.log(`\n${B}─── Solicitação de "${ambienteSolicitante}" ─────────────────────────${X}`);
  console.log(`  Normal:  ${decisaoIcon(resultado.decisao)}`);
  console.log(`  ${CINZA}         ${resultado.motivo}${X}`);
  if (resultado.recado) console.log(`  ${CINZA}         ✉ "${resultado.recado}"${X}`);
  console.log(`  Urgente: ${decisaoIcon(resultadoUrgente.decisao)}`);
  console.log(`  ${CINZA}         ${resultadoUrgente.motivo}${X}`);

  // Simula colocar na fila para ver como aparece (opcional)
  enfileirar({
    id: "demo-id",
    ambiente: ambienteSolicitante,
    prioridade: "normal",
    timestamp: new Date().toISOString(),
  });
}

// ─── Simulação dos 4 estados ──────────────────────────────────────────────────

const ambientesSimulados: Ambiente[] = ["chat_cli", "desktop", "api", "lumen"];

console.log(`\n${B}─── Simulação — solicitação de "desktop" em cada estado ─────${X}`);

const cenarios: Array<{ label: string; mod: () => void }> = [
  { label: "ausente      ", mod: () => sair() },
  { label: "presente/ociosa", mod: () => { entrar("chat_cli"); atualizarAtividade("ociosa"); } },
  { label: "conversa_ativa ", mod: () => { entrar("chat_cli"); atualizarAtividade("conversa_ativa"); } },
  { label: "processando    ", mod: () => { entrar("chat_cli"); atualizarAtividade("processando"); } },
];

for (const { label, mod } of cenarios) {
  mod();
  const est = obterEstado();
  const r = avaliarPresenca(est, { ambiente_solicitante: "desktop", prioridade: "normal" });
  console.log(`  ${label}  ${decisaoIcon(r.decisao)}  ${CINZA}${r.motivo}${X}`);
}

console.log();

// Ignorando 'ambientesSimulados' não usado — lint
void ambientesSimulados;
