/**
 * Mãos de Finanças — registrar lançamento e resumir o mês.
 * Firestore vive no mobile-api (deps injetadas); aqui só a prosa pro modelo.
 */

export type DependenciasFinancas = {
  criarLancamento: (dados: {
    tipo: "entrada" | "saida";
    valorCentavos: number;
    descricao: string;
    categoria: string;
    carteiraId: string;
    dataMs?: number;
  }) => Promise<string>;
  listarLancamentos: () => Promise<
    Array<{
      tipo: "entrada" | "saida";
      valorCentavos: number;
      data: number;
      descricao: string;
      categoria: string;
      carteiraId: string;
      pago: boolean;
    }>
  >;
  listarCarteiras: () => Promise<Array<{ id: string; apelido: string }>>;
  reaisParaCentavos: (valor: number) => number;
  faixaPeriodo: (periodo: "dia" | "semana" | "mes") => { inicio: number; fim: number };
};

const CATEGORIAS = new Set([
  "alimentacao",
  "transporte",
  "moradia",
  "saude",
  "lazer",
  "contas",
  "renda",
  "outros",
]);

function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseDataBr(texto: string | undefined): number | undefined {
  if (!texto || !texto.trim()) return undefined;
  const t = texto.trim();
  // YYYY-MM-DD
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return d.getTime();
  }
  // DD/MM ou DD/MM/YYYY
  const br = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(t);
  if (br) {
    const dia = Number(br[1]);
    const mes = Number(br[2]) - 1;
    let ano = br[3] ? Number(br[3]) : new Date().getFullYear();
    if (ano < 100) ano += 2000;
    return new Date(ano, mes, dia).getTime();
  }
  return undefined;
}

export async function registrarLancamento(
  deps: DependenciasFinancas,
  args: Record<string, unknown>,
): Promise<string> {
  const tipoRaw = String(args.tipo ?? "").trim().toLowerCase();
  const tipo = tipoRaw === "entrada" || tipoRaw === "saida" ? tipoRaw : null;
  if (!tipo) {
    return 'ERRO: tipo deve ser "entrada" ou "saida".';
  }

  const valorNum = typeof args.valor === "number" ? args.valor : Number(args.valor);
  const valorCentavos = deps.reaisParaCentavos(valorNum);
  if (valorCentavos <= 0) {
    return "ERRO: valor inválido — usa um número em reais (ex.: 32.5).";
  }

  let categoria = String(args.categoria ?? "").trim().toLowerCase();
  if (!categoria || !CATEGORIAS.has(categoria)) {
    categoria = tipo === "entrada" ? "renda" : "outros";
  }

  const descricao = String(args.descricao ?? args.nota ?? "").trim()
    || (tipo === "entrada" ? "Entrada" : "Saída");

  const carteiras = await deps.listarCarteiras();
  if (carteiras.length === 0) {
    return "ERRO: ele ainda não tem carteira. Pede pra criar uma em Cartões no app.";
  }

  const carteiraArg = String(args.carteira ?? "").trim();
  let carteiraId = carteiras[0].id;
  let carteiraNome = carteiras[0].apelido;
  if (carteiraArg) {
    const hit = carteiras.find(
      (c) =>
        c.id === carteiraArg ||
        c.apelido.toLowerCase() === carteiraArg.toLowerCase(),
    );
    if (!hit) {
      return `ERRO: não achei a carteira "${carteiraArg}". Disponíveis: ${carteiras
        .map((c) => c.apelido)
        .join(", ")}.`;
    }
    carteiraId = hit.id;
    carteiraNome = hit.apelido;
  }

  const dataMs = parseDataBr(typeof args.data === "string" ? args.data : undefined);

  try {
    const id = await deps.criarLancamento({
      tipo,
      valorCentavos,
      descricao,
      categoria,
      carteiraId,
      dataMs,
    });
    const rotulo = tipo === "entrada" ? "entrada" : "saída";
    return `Registei ${rotulo} de ${formatarReais(valorCentavos)} (${categoria}) na carteira ${carteiraNome}. (id: ${id})`;
  } catch (error) {
    return `ERRO ao salvar lançamento: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function resumoFinanceiro(
  deps: DependenciasFinancas,
  args: Record<string, unknown>,
): Promise<string> {
  const periodoRaw = String(args.periodo ?? "mes").trim().toLowerCase();
  const periodo =
    periodoRaw === "dia" || periodoRaw === "semana" || periodoRaw === "mes"
      ? periodoRaw
      : "mes";

  try {
    const { inicio, fim } = deps.faixaPeriodo(periodo);
    const todos = await deps.listarLancamentos();
    const lista = todos.filter((l) => l.data >= inicio && l.data < fim);

    let entrou = 0;
    let saiu = 0;
    const porCat = new Map<string, number>();
    for (const l of lista) {
      if (l.tipo === "entrada") entrou += l.valorCentavos;
      else {
        saiu += l.valorCentavos;
        porCat.set(l.categoria, (porCat.get(l.categoria) ?? 0) + l.valorCentavos);
      }
    }
    const saldo = entrou - saiu;
    const pendentes = lista.filter((l) => !l.pago && l.tipo === "saida");

    const cats = [...porCat.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([cat, v]) => `- ${cat}: ${formatarReais(v)}`)
      .join("\n");

    const rotuloPeriodo =
      periodo === "dia" ? "hoje" : periodo === "semana" ? "esta semana" : "este mês";

    let texto =
      `## Resumo financeiro (${rotuloPeriodo})\n` +
      `- Entrou: ${formatarReais(entrou)}\n` +
      `- Saiu: ${formatarReais(saiu)}\n` +
      `- Saldo do período: ${formatarReais(saldo)}\n` +
      `- Lançamentos: ${lista.length}\n` +
      `- Contas pendentes: ${pendentes.length}` +
      (pendentes.length
        ? ` (${formatarReais(pendentes.reduce((a, l) => a + l.valorCentavos, 0))})`
        : "");

    if (cats) {
      texto += `\n\n### Saídas por categoria\n${cats}`;
    }

    if (lista.length === 0) {
      texto += "\n\nNenhum lançamento neste período.";
    }

    return texto;
  } catch (error) {
    return `ERRO ao ler resumo: ${error instanceof Error ? error.message : String(error)}`;
  }
}
