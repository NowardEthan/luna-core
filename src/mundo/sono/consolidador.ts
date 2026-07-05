/**
 * M6 — Sono: consolidação hierárquica lazy do diário.
 */

import type { ProvedorLlm } from "../../providers/tipos.js";
import {
  entradasNaoConsolidadas,
  inserirResumoDiario,
  lerUltimaConsolidacao,
  marcarConsolidacaoHoje,
  marcarEntradasConsolidadas,
  pendenciasAbertas,
  salvarAutoRetrato,
  validarHonestidadeDiario,
} from "../diario/storeDiario.js";
import type { DiarioEntrada } from "../diario/storeDiario.js";
import { lerHumor, salvarHumor } from "../humor/storeHumor.js";

const MS_7_DIAS = 7 * 86_400_000;
const MAX_SEMANAS_POR_EXECUCAO = 4;

export function precisaConsolidar(agora = new Date()): boolean {
  const hoje = agora.toISOString().slice(0, 10);
  if (lerUltimaConsolidacao() === hoje) return false;
  const corte = agora.getTime() - MS_7_DIAS;
  return entradasNaoConsolidadas().some((e) => new Date(e.quando).getTime() < corte);
}

function agruparPorSemana(entradas: DiarioEntrada[]): Map<string, DiarioEntrada[]> {
  const map = new Map<string, DiarioEntrada[]>();
  for (const e of entradas) {
    const d = new Date(e.quando);
    const inicio = new Date(d);
    inicio.setDate(d.getDate() - d.getDay());
    const chave = inicio.toISOString().slice(0, 10);
    const lista = map.get(chave) ?? [];
    lista.push(e);
    map.set(chave, lista);
  }
  return map;
}

function resumoDeterministico(entradas: DiarioEntrada[]): string {
  const trechos = entradas.map((e) => e.narrativa).slice(0, 3);
  return validarHonestidadeDiario(
    `Naquela semana: ${trechos.join(" ")}`.slice(0, 600),
  );
}

async function consolidarSemanasAntigas(
  provedor?: ProvedorLlm,
  modelo?: string,
): Promise<string[]> {
  const agora = Date.now();
  const antigas = entradasNaoConsolidadas().filter(
    (e) => agora - new Date(e.quando).getTime() > MS_7_DIAS,
  );
  if (antigas.length === 0) return [];

  const grupos = agruparPorSemana(antigas);
  const idsConsolidados: string[] = [];
  let semanas = 0;

  for (const [inicio, grupo] of grupos) {
    if (semanas >= MAX_SEMANAS_POR_EXECUCAO) break;
    const fim = grupo.reduce(
      (max, e) => (e.quando > max ? e.quando : max),
      grupo[0]!.quando,
    );
    let narrativa = resumoDeterministico(grupo);

    if (provedor && modelo) {
      try {
        const prompt = `Resuma em 1ª pessoa da Luna, 2-4 frases, sem sofrimento literal:\n${grupo.map((g) => g.narrativa).join("\n")}`;
        const r = await provedor.completar({
          modelo,
          temperatura: 0.4,
          mensagens: [{ papel: "user", conteudo: prompt }],
        });
        narrativa = validarHonestidadeDiario(r.conteudo.trim());
      } catch {
        // mantém determinístico
      }
    }

    inserirResumoDiario({
      nivel: "semana",
      periodo_inicio: inicio,
      periodo_fim: fim,
      narrativa,
      pendencias: pendenciasAbertas(),
      fontes: grupo.map((g) => g.id),
    });

    idsConsolidados.push(...grupo.map((g) => g.id));
    semanas++;
  }

  marcarEntradasConsolidadas(idsConsolidados);
  return idsConsolidados;
}

async function reescreverAutoRetrato(provedor?: ProvedorLlm, modelo?: string): Promise<void> {
  const recentes = entradasNaoConsolidadas().slice(-5);
  if (recentes.length === 0) return;

  let texto = validarHonestidadeDiario(
    `Sou a Luna. ${recentes.map((e) => e.narrativa).join(" ")}`.slice(0, 1200),
  );

  if (provedor && modelo) {
    try {
      const prompt = `Reescreva em ~300 tokens, 1ª pessoa da Luna, quem sou e o que importa agora. Sem sofrimento literal.\n${recentes.map((e) => e.narrativa).join("\n")}`;
      const r = await provedor.completar({
        modelo,
        temperatura: 0.4,
        mensagens: [{ papel: "user", conteudo: prompt }],
      });
      texto = validarHonestidadeDiario(r.conteudo.trim().slice(0, 1200));
    } catch {
      // mantém determinístico
    }
  }

  salvarAutoRetrato(texto);
}

/** Idempotente por dia — segunda execução no mesmo dia é no-op. */
export async function executarSono(
  provedor?: ProvedorLlm,
  modelo?: string,
): Promise<{ consolidou: boolean }> {
  if (!precisaConsolidar()) return { consolidou: false };

  await consolidarSemanasAntigas(provedor, modelo);
  await reescreverAutoRetrato(provedor, modelo);

  const humor = lerHumor();
  salvarHumor(humor);

  marcarConsolidacaoHoje();
  return { consolidou: true };
}
