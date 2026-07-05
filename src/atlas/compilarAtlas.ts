import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const DATA_CANONICA = "2026-07-05";

export const RegistroAtlasSchema = z.object({
  id: z.string().min(1),
  tipo: z.string().min(1),
  titulo: z.string().min(1),
  resumo: z.string().min(80).max(150),
  palavras_chave: z.array(z.string().min(1)).min(1),
  estado: z.literal("implementado"),
  desde: z.literal(DATA_CANONICA),
});

export const ManifestAtlasSchema = z.object({
  nome: z.string().min(1),
  versao: z.string().min(1),
  schema: z.string().min(1),
  pasta_registros: z.string().min(1),
  saida_compilada: z.string().min(1),
  total_registros_esperado: z.number().int().positive(),
  ids_planejados: z.array(z.string().min(1)).min(1),
});

export type RegistroAtlas = z.infer<typeof RegistroAtlasSchema>;
export type ManifestAtlas = z.infer<typeof ManifestAtlasSchema>;

export type ResultadoValidacaoAtlas = {
  manifest: ManifestAtlas;
  registros: RegistroAtlas[];
};

export type AtlasCompilado = ResultadoValidacaoAtlas & {
  compilado_em: string;
};

const arquivoAtual = fileURLToPath(import.meta.url);
const pastaAtlas = path.resolve(path.dirname(arquivoAtual));
const caminhoManifest = path.join(pastaAtlas, "manifest.json");
const pastaRegistros = path.join(pastaAtlas, "registros");
const caminhoCompilado = path.join(pastaAtlas, "atlas.compiled.json");

function normalizarRegistroBruto(valor: unknown, arquivo: string): RegistroAtlas {
  const parsed = RegistroAtlasSchema.safeParse(valor);
  if (!parsed.success) {
    const erro = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Registro inválido em ${arquivo}: ${erro}`);
  }
  return parsed.data;
}

export async function carregarManifestAtlas(): Promise<ManifestAtlas> {
  const conteudo = await readFile(caminhoManifest, "utf-8");
  const bruto = JSON.parse(conteudo) as unknown;
  const parsed = ManifestAtlasSchema.safeParse(bruto);
  if (!parsed.success) {
    throw new Error(`Manifest Atlas inválido: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  return parsed.data;
}

export async function carregarRegistrosAtlas(): Promise<RegistroAtlas[]> {
  const arquivos = (await readdir(pastaRegistros))
    .filter((nome) => nome.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  const registros: RegistroAtlas[] = [];
  for (const arquivo of arquivos) {
    const caminho = path.join(pastaRegistros, arquivo);
    const conteudo = await readFile(caminho, "utf-8");
    const bruto = JSON.parse(conteudo) as unknown;
    registros.push(normalizarRegistroBruto(bruto, arquivo));
  }

  return registros.sort((a, b) => a.id.localeCompare(b.id));
}

function validarIntegridade(manifest: ManifestAtlas, registros: RegistroAtlas[]): void {
  if (registros.length !== manifest.total_registros_esperado) {
    throw new Error(
      `Total de registros inválido: esperado ${manifest.total_registros_esperado}, recebido ${registros.length}`,
    );
  }

  const idsLidos = new Set<string>();
  for (const registro of registros) {
    if (idsLidos.has(registro.id)) {
      throw new Error(`ID duplicado encontrado: ${registro.id}`);
    }
    idsLidos.add(registro.id);
  }

  for (const id of manifest.ids_planejados) {
    if (!idsLidos.has(id)) {
      throw new Error(`ID planeado ausente: ${id}`);
    }
  }
}

export async function validarAtlas(): Promise<ResultadoValidacaoAtlas> {
  const manifest = await carregarManifestAtlas();
  const registros = await carregarRegistrosAtlas();
  validarIntegridade(manifest, registros);
  return { manifest, registros };
}

export async function compilarAtlas(): Promise<AtlasCompilado> {
  const { manifest, registros } = await validarAtlas();

  const compilado: AtlasCompilado = {
    manifest,
    registros,
    compilado_em: new Date().toISOString(),
  };

  await writeFile(caminhoCompilado, `${JSON.stringify(compilado, null, 2)}\n`, "utf-8");
  return compilado;
}

export function obterCaminhoCompiladoAtlas(): string {
  return caminhoCompilado;
}
