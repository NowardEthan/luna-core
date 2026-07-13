import { extractDocuments } from "./extractDocuments.js";

/**
 * Busca os documentos do turno no Storage e extrai o texto — para a Luna os ler por
 * PARTES (`ler_arquivo`), em vez de os receber colados dentro da mensagem.
 *
 * O desenho antigo empurrava o arquivo inteiro para dentro do prompt. Um PDF de 110
 * páginas (~300 mil chars) era cortado a meio pelo servidor, e ela respondia com
 * confiança total sobre um documento do qual tinha perdido 90% — sem saber. Aqui o texto
 * fica DO LADO DE FORA da cabeça dela, e ela vai buscar o que precisa.
 */

export type DocumentoCarregado = {
  id: string;
  nome?: string;
  mimeType?: string;
  texto: string;
  paginas?: number;
};

type EntradaDocumento = {
  id: string;
  name?: string;
  mimeType?: string;
  url: string;
};

/** Teto de download — o mesmo do extractDocuments (o pdf-parse já recusa acima disto). */
const MAX_BYTES = 12 * 1024 * 1024;

/**
 * Cache por URL. As URLs do Storage são estáveis, e o mesmo documento é consultado
 * várias vezes na mesma conversa (é esse o ponto da leitura por partes): sem cache,
 * cada `ler_arquivo` re-baixaria e re-extrairia o PDF inteiro.
 */
const cacheTexto = new Map<string, DocumentoCarregado>();
const MAX_CACHE = 24;

function guardarNoCache(url: string, doc: DocumentoCarregado): void {
  if (cacheTexto.size >= MAX_CACHE) {
    const maisAntigo = cacheTexto.keys().next().value;
    if (maisAntigo) cacheTexto.delete(maisAntigo);
  }
  cacheTexto.set(url, doc);
}

async function baixar(url: string): Promise<Buffer | null> {
  const res = await fetch(url);
  if (!res.ok) return null;

  const tamanho = Number(res.headers.get("content-length") ?? 0);
  if (tamanho > MAX_BYTES) return null;

  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer.length > MAX_BYTES ? null : buffer;
}

export async function carregarDocumentos(
  entradas: EntradaDocumento[] | undefined,
): Promise<DocumentoCarregado[]> {
  if (!entradas?.length) return [];

  const carregados: DocumentoCarregado[] = [];

  for (const entrada of entradas) {
    const cacheado = cacheTexto.get(entrada.url);
    if (cacheado) {
      carregados.push({ ...cacheado, id: entrada.id });
      continue;
    }

    try {
      const buffer = await baixar(entrada.url);
      if (!buffer) {
        console.warn(`[documentos] não consegui baixar ${entrada.name ?? entrada.url}`);
        continue;
      }

      const [extraido] = await extractDocuments({
        files: [
          {
            fileBase64: buffer.toString("base64"),
            mimeType: entrada.mimeType ?? "application/octet-stream",
            name: entrada.name,
          },
        ],
      });

      const texto = extraido?.text?.trim() ?? "";
      if (!texto) {
        console.warn(`[documentos] extração vazia para ${entrada.name ?? entrada.url}`);
        continue;
      }

      const doc: DocumentoCarregado = {
        id: entrada.id,
        nome: entrada.name,
        mimeType: entrada.mimeType,
        texto,
      };

      guardarNoCache(entrada.url, doc);
      carregados.push(doc);
    } catch (erro) {
      console.warn(
        `[documentos] falha ao ler ${entrada.name ?? entrada.url}:`,
        erro instanceof Error ? erro.message : erro,
      );
    }
  }

  return carregados;
}
