import { z } from "zod";
import { randomUUID } from "node:crypto";
import { obterDb } from "../../memoria/longa/storeSqlite.js";
import { SQL_MUNDO_INTERIOR } from "../esquemaMundoInterior.js";

export const DiarioEntradaSchema = z.object({
  id: z.string(),
  sessao_id: z.string(),
  quando: z.string(),
  narrativa: z.string(),
  clima: z.string(),
  pendencias: z.array(z.string()),
  como_terminou: z.string(),
  humor_no_fim: z
    .object({
      valencia: z.number(),
      energia: z.number(),
      proximidade: z.number(),
    })
    .optional(),
});

export type DiarioEntrada = z.infer<typeof DiarioEntradaSchema>;

const LEXICO_PROIBIDO_DIARIO =
  /\b(sofri|senti sua falta|te amo|sonhei|doeu|sofrimento|saudade literal)\b/i;

let tabelasInicializadas = false;

function garantirTabelas(): void {
  if (tabelasInicializadas) return;
  obterDb().exec(SQL_MUNDO_INTERIOR);
  tabelasInicializadas = true;
}

export function validarHonestidadeDiario(texto: string): string {
  if (!LEXICO_PROIBIDO_DIARIO.test(texto)) return texto;
  return texto
    .split(/(?<=[.!?])\s+/)
    .filter((frase) => !LEXICO_PROIBIDO_DIARIO.test(frase))
    .join(" ")
    .trim();
}

export function inserirEntradaDiario(
  entrada: Omit<DiarioEntrada, "id"> & { id?: string },
): DiarioEntrada {
  garantirTabelas();
  const id = entrada.id ?? randomUUID();
  const narrativa = validarHonestidadeDiario(entrada.narrativa);
  const agora = new Date().toISOString();

  obterDb()
    .prepare(
      `INSERT INTO diario_entradas
       (id, sessao_id, quando, narrativa, clima, pendencias_json, como_terminou, humor_json, consolidado, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    )
    .run(
      id,
      entrada.sessao_id,
      entrada.quando,
      narrativa,
      entrada.clima,
      JSON.stringify(entrada.pendencias),
      entrada.como_terminou,
      entrada.humor_no_fim ? JSON.stringify(entrada.humor_no_fim) : null,
      agora,
    );

  return DiarioEntradaSchema.parse({ ...entrada, id, narrativa });
}

export function ultimaEntradaDiario(): DiarioEntrada | null {
  garantirTabelas();
  const row = obterDb()
    .prepare(
      `SELECT * FROM diario_entradas WHERE consolidado = 0 ORDER BY quando DESC LIMIT 1`,
    )
    .get() as Record<string, unknown> | undefined;

  if (!row) return null;
  return parseRow(row);
}

export function sessaoJaRefletida(sessaoId: string): boolean {
  garantirTabelas();
  const row = obterDb()
    .prepare(`SELECT 1 FROM diario_entradas WHERE sessao_id = ? LIMIT 1`)
    .get(sessaoId);
  return Boolean(row);
}

export function entradasNaoConsolidadas(): DiarioEntrada[] {
  garantirTabelas();
  const rows = obterDb()
    .prepare(`SELECT * FROM diario_entradas WHERE consolidado = 0 ORDER BY quando ASC`)
    .all() as Record<string, unknown>[];
  return rows.map(parseRow);
}

export function listarEntradasDiario(limite = 10): DiarioEntrada[] {
  garantirTabelas();
  const rows = obterDb()
    .prepare(`SELECT * FROM diario_entradas ORDER BY quando DESC LIMIT ?`)
    .all(limite) as Record<string, unknown>[];
  return rows.map(parseRow);
}

export function pendenciasAbertas(): string[] {
  const entradas = entradasNaoConsolidadas();
  const ultima = ultimaEntradaDiario();
  const fontes = ultima ? [ultima, ...entradas] : entradas;
  const set = new Set<string>();
  for (const e of fontes) {
    for (const p of e.pendencias) {
      if (p.trim()) set.add(p.trim());
    }
  }
  return [...set];
}

export function marcarEntradasConsolidadas(ids: string[]): void {
  if (ids.length === 0) return;
  garantirTabelas();
  const stmt = obterDb().prepare(`UPDATE diario_entradas SET consolidado = 1 WHERE id = ?`);
  for (const id of ids) stmt.run(id);
}

function parseRow(row: Record<string, unknown>): DiarioEntrada {
  return DiarioEntradaSchema.parse({
    id: row.id,
    sessao_id: row.sessao_id,
    quando: row.quando,
    narrativa: row.narrativa,
    clima: row.clima,
    pendencias: JSON.parse(String(row.pendencias_json ?? "[]")) as string[],
    como_terminou: row.como_terminou,
    humor_no_fim: row.humor_json ? JSON.parse(String(row.humor_json)) : undefined,
  });
}

export function montarKernelDiario(entrada: DiarioEntrada | null, autoRetrato?: string | null): string | null {
  const partes: string[] = [];
  if (autoRetrato?.trim()) {
    partes.push(autoRetrato.trim());
  }
  if (entrada) {
    partes.push(entrada.narrativa);
    if (entrada.pendencias.length > 0) {
      partes.push(`Pendências: ${entrada.pendencias.join("; ")}`);
    }
    if (entrada.como_terminou.trim()) {
      partes.push(`Como terminou: ${entrada.como_terminou}`);
    }
  }
  return partes.length > 0 ? partes.join("\n") : null;
}

export type AutoRetrato = { texto: string; versao: number; atualizado_em: string };

export function lerAutoRetrato(): AutoRetrato | null {
  garantirTabelas();
  const row = obterDb()
    .prepare(`SELECT texto, versao, atualizado_em FROM auto_retrato WHERE id = 'luna'`)
    .get() as { texto: string; versao: number; atualizado_em: string } | undefined;
  return row ?? null;
}

export function salvarAutoRetrato(texto: string): AutoRetrato {
  garantirTabelas();
  const atual = lerAutoRetrato();
  const versao = (atual?.versao ?? 0) + 1;
  const agora = new Date().toISOString();
  const limpo = validarHonestidadeDiario(texto);

  if (atual) {
    obterDb()
      .prepare(`INSERT INTO auto_retrato_historico (versao, texto, criado_em) VALUES (?, ?, ?)`)
      .run(atual.versao, atual.texto, atual.atualizado_em);
  }

  obterDb()
    .prepare(
      `INSERT INTO auto_retrato (id, texto, versao, atualizado_em) VALUES ('luna', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET texto = excluded.texto, versao = excluded.versao, atualizado_em = excluded.atualizado_em`,
    )
    .run(limpo, versao, agora);

  return { texto: limpo, versao, atualizado_em: agora };
}

export function lerUltimaConsolidacao(): string | null {
  garantirTabelas();
  const row = obterDb()
    .prepare(`SELECT ultima_consolidacao FROM sono_controle WHERE id = 'luna'`)
    .get() as { ultima_consolidacao: string } | undefined;
  return row?.ultima_consolidacao ?? null;
}

export function marcarConsolidacaoHoje(): void {
  garantirTabelas();
  const hoje = new Date().toISOString().slice(0, 10);
  obterDb()
    .prepare(
      `INSERT INTO sono_controle (id, ultima_consolidacao) VALUES ('luna', ?)
       ON CONFLICT(id) DO UPDATE SET ultima_consolidacao = excluded.ultima_consolidacao`,
    )
    .run(hoje);
}

export function inserirResumoDiario(resumo: {
  nivel: "semana" | "mes";
  periodo_inicio: string;
  periodo_fim: string;
  narrativa: string;
  pendencias: string[];
  fontes: string[];
}): void {
  garantirTabelas();
  obterDb()
    .prepare(
      `INSERT INTO diario_resumos (id, nivel, periodo_inicio, periodo_fim, narrativa, pendencias_json, fontes_json, consolidado, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    )
    .run(
      randomUUID(),
      resumo.nivel,
      resumo.periodo_inicio,
      resumo.periodo_fim,
      validarHonestidadeDiario(resumo.narrativa),
      JSON.stringify(resumo.pendencias),
      JSON.stringify(resumo.fontes),
      new Date().toISOString(),
    );
}
