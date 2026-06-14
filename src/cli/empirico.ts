/**
 * Validação empírica — Luna Core
 * Roda o dataset de casos reais contra o tálamo e o analisador de regras,
 * mostrando um relatório visual com acertos, regressões e gaps documentados.
 *
 * Uso: npm run empirico
 */

import { classificarProfundidade } from "../estado/talamoPipeline.js";
import { analisarContextoPorRegras } from "../analyzers/analisadorContextoRegras.js";
import { CASOS_TALAMICO, CASOS_ANALISE } from "../empirico/casos.js";
import type { AnaliseContexto } from "../analyzers/esquema.js";

// ─── Cores ANSI ───────────────────────────────────────────────────────────────

const V = "\x1b[32m"; // verde
const R = "\x1b[31m"; // vermelho
const A = "\x1b[33m"; // amarelo
const C = "\x1b[90m"; // cinza
const B = "\x1b[1m";  // negrito
const X = "\x1b[0m";  // reset

// ─── Helpers ──────────────────────────────────────────────────────────────────

function trunc(txt: string, max: number): string {
  return txt.length > max ? txt.slice(0, max - 1) + "…" : txt;
}

function pad(txt: string, len: number): string {
  return txt.padEnd(len);
}

// ─── Runner do Tálamo ─────────────────────────────────────────────────────────

type ResultadoTalamico = { certos: number; erros: number; gaps: number; total: number };

function rodarTalamico(): ResultadoTalamico {
  let certos = 0, erros = 0, gaps = 0;

  console.log(`\n${B}📊 TÁLAMO — Classificação de Profundidade${X}`);
  console.log("─".repeat(68));

  for (const caso of CASOS_TALAMICO) {
    const real = classificarProfundidade(caso.mensagem);
    const acertou = real === caso.esperado;
    const msg = pad(trunc(`"${caso.mensagem}"`, 44), 46);

    if (caso.adversarial) {
      gaps++;
      const status = acertou ? `${V}✓ CORRIGIDO${X}` : `${A}~ GAP     ${X}`;
      console.log(`  ${status}  ${msg} esperado: ${pad(caso.esperado, 8)} real: ${real}`);
      if (!acertou && caso.nota) console.log(`  ${C}           ↳ ${caso.nota}${X}`);
    } else if (acertou) {
      certos++;
      console.log(`  ${V}✓${X}  ${msg} ${C}${real}${X}`);
    } else {
      erros++;
      console.log(`  ${R}✗${X}  ${msg} esperado: ${V}${caso.esperado}${X} real: ${R}${real}${X}`);
      if (caso.nota) console.log(`  ${C}     ↳ ${caso.nota}${X}`);
    }
  }

  const total = CASOS_TALAMICO.filter((c) => !c.adversarial).length;
  const resumoErros = erros > 0 ? `  ${R}${erros} regressão(ões)${X}` : `  ${V}sem regressões${X}`;
  const resumoGaps = gaps > 0 ? `  ${A}${gaps} gap(s) documentado(s)${X}` : "";
  console.log(`\n${B}Tálamo: ${certos}/${total} corretos${X}${resumoErros}${resumoGaps}`);

  return { certos, erros, gaps, total };
}

// ─── Runner de Análise ────────────────────────────────────────────────────────

type ResultadoAnalise = { certos: number; erros: number; gaps: number; total: number };

function rodarAnalise(): ResultadoAnalise {
  let certos = 0, erros = 0, gaps = 0;

  console.log(`\n${B}📊 ANÁLISE — Intenção e Risco (regras)${X}`);
  console.log("─".repeat(68));

  for (const caso of CASOS_ANALISE) {
    const analise = analisarContextoPorRegras(caso.mensagem);
    const real = String(analise[caso.campo as keyof AnaliseContexto]);
    const acertou = real === caso.esperado;
    const msg = pad(trunc(`"${caso.mensagem}"`, 40), 42);
    const campo = `[${caso.campo}]`.padEnd(14);

    if (caso.adversarial) {
      gaps++;
      const status = acertou ? `${V}✓ CORRIGIDO${X}` : `${A}~ GAP     ${X}`;
      console.log(`  ${status}  ${msg} ${C}${campo}${X} esperado: ${pad(caso.esperado, 10)} real: ${real}`);
      if (!acertou && caso.nota) console.log(`  ${C}           ↳ ${caso.nota}${X}`);
    } else if (acertou) {
      certos++;
      console.log(`  ${V}✓${X}  ${msg} ${C}${campo} ${real}${X}`);
    } else {
      erros++;
      console.log(`  ${R}✗${X}  ${msg} ${C}${campo}${X} esperado: ${V}${caso.esperado}${X} real: ${R}${real}${X}`);
      if (caso.nota) console.log(`  ${C}     ↳ ${caso.nota}${X}`);
    }
  }

  const total = CASOS_ANALISE.filter((c) => !c.adversarial).length;
  const resumoErros = erros > 0 ? `  ${R}${erros} regressão(ões)${X}` : `  ${V}sem regressões${X}`;
  const resumoGaps = gaps > 0 ? `  ${A}${gaps} gap(s) documentado(s)${X}` : "";
  console.log(`\n${B}Análise: ${certos}/${total} corretos${X}${resumoErros}${resumoGaps}`);

  return { certos, erros, gaps, total };
}

// ─── Sumário geral ────────────────────────────────────────────────────────────

console.log(`\n${B}╔══════════════════════════════════════════════════════════════════╗`);
console.log(`║              VALIDAÇÃO EMPÍRICA — Luna Core V2.2                ║`);
console.log(`╚══════════════════════════════════════════════════════════════════╝${X}`);

const talamico = rodarTalamico();
const analise = rodarAnalise();

const totalCertos = talamico.certos + analise.certos;
const totalTotal = talamico.total + analise.total;
const totalErros = talamico.erros + analise.erros;
const totalGaps = talamico.gaps + analise.gaps;

console.log(`\n${"─".repeat(68)}`);
const semRegressoes = totalErros === 0;
console.log(
  `${B}TOTAL: ${totalCertos}/${totalTotal} corretos${X}` +
  (semRegressoes ? `  ${V}✓ sem regressões${X}` : `  ${R}✗ ${totalErros} regressão(ões)${X}`) +
  (totalGaps > 0 ? `  ${A}${totalGaps} gap(s) conhecidos${X}` : ""),
);

if (totalGaps > 0) {
  console.log(`${C}\nGaps são comportamentos incorretos documentados — ainda não corrigidos.`);
  console.log(`Quando corrigidos, aparecerão como '✓ CORRIGIDO' neste relatório.${X}`);
}

console.log();

if (!semRegressoes) process.exit(1);
