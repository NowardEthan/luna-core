/**
 * Mãos de Finanças — registrar, listar, resumir, recorrentes, carteiras, transferir.
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
    recorrenteId?: string | null;
    pago?: boolean;
  }) => Promise<string>;
  listarLancamentos: () => Promise<
    Array<{
      id?: string;
      tipo: "entrada" | "saida";
      valorCentavos: number;
      data: number;
      descricao: string;
      categoria: string;
      carteiraId: string;
      pago: boolean;
    }>
  >;
  listarCarteiras: () => Promise<
    Array<{ id: string; apelido: string; tipo?: string }>
  >;
  criarCarteira?: (dados: {
    tipo: string;
    apelido: string;
    banco?: string | null;
    cor?: string;
    ultimos4?: string | null;
    limiteCentavos?: number | null;
    fechamentoDia?: number | null;
    vencimentoDia?: number | null;
    saldoInicialCentavos?: number;
  }) => Promise<string>;
  atualizarCarteira?: (
    id: string,
    patch: Partial<{
      tipo: string;
      apelido: string;
      banco: string | null;
      cor: string;
      ultimos4: string | null;
      limiteCentavos: number | null;
      fechamentoDia: number | null;
      vencimentoDia: number | null;
      saldoInicialCentavos: number;
    }>,
  ) => Promise<void>;
  arquivarCarteira?: (id: string) => Promise<void>;
  listarRecorrentes?: () => Promise<
    Array<{
      id: string;
      tipo: "entrada" | "saida";
      valorCentavos: number;
      diaDoMes: number;
      categoria: string;
      carteiraId: string;
      apelido: string;
      variavel: boolean;
      ativo: boolean;
    }>
  >;
  criarRecorrente?: (dados: {
    tipo: "entrada" | "saida";
    valorCentavos: number;
    diaDoMes: number;
    categoria: string;
    carteiraId: string;
    apelido: string;
    variavel?: boolean;
  }) => Promise<string>;
  atualizarRecorrente?: (
    id: string,
    patch: Partial<{
      tipo: "entrada" | "saida";
      valorCentavos: number;
      diaDoMes: number;
      categoria: string;
      carteiraId: string;
      apelido: string;
      variavel: boolean;
      ativo: boolean;
    }>,
  ) => Promise<void>;
  criarTransferencia?: (dados: {
    deCarteiraId: string;
    paraCarteiraId: string;
    valorCentavos: number;
    dataMs?: number;
    motivo?: string | null;
    nota?: string | null;
  }) => Promise<string>;
  listarMetas?: () => Promise<
    Array<{
      id: string;
      apelido: string;
      tipo: "reserva" | "corte" | "gasto_mes";
      alvoCentavos: number;
      atualCentavos: number;
      categoria?: string | null;
      ativa: boolean;
    }>
  >;
  criarMeta?: (dados: {
    apelido: string;
    tipo: "reserva" | "corte" | "gasto_mes";
    alvoCentavos: number;
    atualCentavos?: number;
    categoria?: string | null;
  }) => Promise<string>;
  atualizarMeta?: (
    id: string,
    patch: Partial<{
      apelido: string;
      tipo: "reserva" | "corte" | "gasto_mes";
      alvoCentavos: number;
      atualCentavos: number;
      categoria: string | null;
      ativa: boolean;
    }>,
  ) => Promise<void>;
  apagarMeta?: (id: string) => Promise<void>;
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

const TIPOS_CARTEIRA = new Set(["conta_debito", "cartao_credito", "dinheiro"]);
const MOTIVOS_TRANSF = new Set(["pagar_fatura", "reserva", "ajuste"]);
const TIPOS_META = new Set(["reserva", "corte", "gasto_mes"]);

function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Aceita number ou string BR («32,90», «R$ 1.234,56») / EN («32.90»).
 * O schema pede number, mas o modelo manda string com vírgula com frequência —
 * Number("32,90") vira NaN e a mão devolvia ERRO (badge mentia sucesso antes do fix).
 */
function parseValorReais(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return Number(raw);
  let t = raw.trim().replace(/R\$\s*/i, "").replace(/\s/g, "");
  if (!t) return NaN;
  if (t.includes(",") && t.includes(".")) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (t.includes(",")) {
    t = t.replace(",", ".");
  }
  return Number(t);
}

function formatarDia(ms: number): string {
  return new Date(ms).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function parseDataBr(texto: string | undefined): number | undefined {
  if (!texto || !texto.trim()) return undefined;
  const t = texto.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return d.getTime();
  }
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

function categoriaSegura(raw: unknown, tipo: "entrada" | "saida"): string {
  let categoria = String(raw ?? "").trim().toLowerCase();
  if (!categoria || !CATEGORIAS.has(categoria)) {
    categoria = tipo === "entrada" ? "renda" : "outros";
  }
  return categoria;
}

async function resolverCarteira(
  deps: DependenciasFinancas,
  carteiraArg: string | undefined,
): Promise<{ id: string; apelido: string } | string> {
  const carteiras = await deps.listarCarteiras();
  if (carteiras.length === 0) {
    return "ERRO: ele ainda não tem carteira. Pede pra criar uma em Cartões no app (ou usa gerir_carteira).";
  }
  if (!carteiraArg?.trim()) {
    return { id: carteiras[0].id, apelido: carteiras[0].apelido };
  }
  const arg = carteiraArg.trim();
  const hit = carteiras.find(
    (c) => c.id === arg || c.apelido.toLowerCase() === arg.toLowerCase(),
  );
  if (!hit) {
    return `ERRO: não achei a carteira "${arg}". Disponíveis: ${carteiras
      .map((c) => c.apelido)
      .join(", ")}.`;
  }
  return { id: hit.id, apelido: hit.apelido };
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

  const valorNum = parseValorReais(args.valor);
  const valorCentavos = deps.reaisParaCentavos(valorNum);
  if (valorCentavos <= 0) {
    return "ERRO: valor inválido — usa um número em reais (ex.: 32.5 ou 32,90).";
  }

  const categoria = categoriaSegura(args.categoria, tipo);
  const descricao =
    String(args.descricao ?? args.nota ?? "").trim() ||
    (tipo === "entrada" ? "Entrada" : "Saída");

  const carteira = await resolverCarteira(
    deps,
    typeof args.carteira === "string" ? args.carteira : undefined,
  );
  if (typeof carteira === "string") return carteira;

  const dataMs = parseDataBr(typeof args.data === "string" ? args.data : undefined);
  const querRecorrente =
    args.recorrente === true ||
    String(args.recorrente ?? "").toLowerCase() === "true" ||
    String(args.recorrente ?? "").toLowerCase() === "sim";

  try {
    let recorrenteId: string | null = null;
    if (querRecorrente && deps.criarRecorrente) {
      const dia =
        typeof args.diaDoMes === "number"
          ? Math.round(args.diaDoMes)
          : new Date(dataMs ?? Date.now()).getDate();
      recorrenteId = await deps.criarRecorrente({
        tipo,
        valorCentavos,
        diaDoMes: Math.min(31, Math.max(1, dia)),
        categoria,
        carteiraId: carteira.id,
        apelido: descricao,
        variavel: false,
      });
    }

    const id = await deps.criarLancamento({
      tipo,
      valorCentavos,
      descricao,
      categoria,
      carteiraId: carteira.id,
      dataMs,
      recorrenteId,
      pago: true,
    });
    const rotulo = tipo === "entrada" ? "entrada" : "saída";
    let msg = `Registrei ${rotulo} de ${formatarReais(valorCentavos)} (${categoria}) na carteira ${carteira.apelido}. (id: ${id})`;
    if (recorrenteId) {
      msg += ` Também criei o recorrente mensal (id: ${recorrenteId}).`;
    }
    return msg;
  } catch (error) {
    return `ERRO ao salvar lançamento: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Registra VÁRIOS lançamentos numa chamada só (lote). Sem isto, «anota esses 9 gastos»
 * virava 9 chamadas de `registrar_lancamento` — uma por rodada — e o turno estourava o
 * orçamento de rodadas antes de terminar. Reusa a mão singular por item (mesma validação
 * e resolução de carteira), e devolve um resumo com o resultado de cada um. Sucesso parcial
 * é ok: os que falharem vêm marcados pra ela reconciliar.
 */
export async function registrarLancamentosLote(
  deps: DependenciasFinancas,
  args: Record<string, unknown>,
): Promise<string> {
  const itensRaw = Array.isArray(args.itens)
    ? args.itens
    : Array.isArray(args.lancamentos)
      ? args.lancamentos
      : null;
  if (!itensRaw || itensRaw.length === 0) {
    return "ERRO: passa em `itens` a lista de lançamentos (cada um com tipo e valor, e opcional descricao/categoria/carteira/data).";
  }
  if (itensRaw.length > 50) {
    return "ERRO: no máximo 50 lançamentos por lote — divide em partes.";
  }
  const linhas: string[] = [];
  let ok = 0;
  let falhas = 0;
  for (let i = 0; i < itensRaw.length; i++) {
    const item = itensRaw[i];
    if (!item || typeof item !== "object") {
      linhas.push(`${i + 1}. ERRO: item inválido (esperava um objeto com tipo e valor).`);
      falhas++;
      continue;
    }
    const r = await registrarLancamento(deps, item as Record<string, unknown>);
    if (/^\s*ERRO\b/i.test(r)) falhas++;
    else ok++;
    linhas.push(`${i + 1}. ${r}`);
  }
  const cabec = `Lote concluído: ${ok} registrado(s)${falhas > 0 ? `, ${falhas} com erro (vê abaixo e refaz só esses)` : ""}.`;
  return `${cabec}\n${linhas.join("\n")}`;
}

export async function listarLancamentosFinanca(
  deps: DependenciasFinancas,
  args: Record<string, unknown>,
): Promise<string> {
  const periodoRaw = String(args.periodo ?? "mes").trim().toLowerCase();
  const periodo =
    periodoRaw === "dia" || periodoRaw === "semana" || periodoRaw === "mes"
      ? periodoRaw
      : "mes";
  const soPendentes =
    args.soPendentes === true ||
    String(args.soPendentes ?? "").toLowerCase() === "true";
  const categoriaFiltro = String(args.categoria ?? "").trim().toLowerCase();
  const carteiraArg =
    typeof args.carteira === "string" ? args.carteira.trim() : "";

  try {
    const { inicio, fim } = deps.faixaPeriodo(periodo);
    const carteiras = await deps.listarCarteiras();
    const nomePorId = new Map(carteiras.map((c) => [c.id, c.apelido]));
    let carteiraId: string | null = null;
    if (carteiraArg) {
      const hit = carteiras.find(
        (c) =>
          c.id === carteiraArg ||
          c.apelido.toLowerCase() === carteiraArg.toLowerCase(),
      );
      if (!hit) {
        return `ERRO: não achei a carteira "${carteiraArg}".`;
      }
      carteiraId = hit.id;
    }

    const todos = await deps.listarLancamentos();
    let lista = todos.filter((l) => l.data >= inicio && l.data < fim);
    if (carteiraId) lista = lista.filter((l) => l.carteiraId === carteiraId);
    if (categoriaFiltro && CATEGORIAS.has(categoriaFiltro)) {
      lista = lista.filter((l) => l.categoria === categoriaFiltro);
    }
    if (soPendentes) lista = lista.filter((l) => !l.pago);

    lista.sort((a, b) => b.data - a.data);
    const max = 25;
    const fatia = lista.slice(0, max);

    const rotuloPeriodo =
      periodo === "dia" ? "hoje" : periodo === "semana" ? "esta semana" : "este mês";

    if (fatia.length === 0) {
      return `Nenhum lançamento em ${rotuloPeriodo}${soPendentes ? " (só pendentes)" : ""}.`;
    }

    const linhas = fatia.map((l) => {
      const sinal = l.tipo === "entrada" ? "+" : "−";
      const cart = nomePorId.get(l.carteiraId) ?? "?";
      const pend = !l.pago ? " · pendente" : "";
      return `- ${formatarDia(l.data)} ${sinal}${formatarReais(l.valorCentavos)} · ${l.descricao || l.categoria} · ${cart}${pend}`;
    });

    let texto =
      `## Lançamentos (${rotuloPeriodo})\n` +
      `Total filtrado: ${lista.length}` +
      (lista.length > max ? ` (mostrando ${max})` : "") +
      `\n${linhas.join("\n")}`;
    return texto;
  } catch (error) {
    return `ERRO ao listar lançamentos: ${error instanceof Error ? error.message : String(error)}`;
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

export async function gerirRecorrente(
  deps: DependenciasFinancas,
  args: Record<string, unknown>,
): Promise<string> {
  const acao = String(args.acao ?? "").trim().toLowerCase();
  if (!["criar", "editar", "desativar", "listar"].includes(acao)) {
    return 'ERRO: acao deve ser "criar", "editar", "desativar" ou "listar".';
  }

  if (acao === "listar") {
    if (!deps.listarRecorrentes) {
      return "ERRO FATAL: listar recorrentes não está disponível.";
    }
    try {
      const lista = await deps.listarRecorrentes();
      const ativos = lista.filter((r) => r.ativo);
      if (ativos.length === 0) return "Nenhum recorrente ativo.";
      const carteiras = await deps.listarCarteiras();
      const nomePorId = new Map(carteiras.map((c) => [c.id, c.apelido]));
      const linhas = ativos.map((r) => {
        const cart = nomePorId.get(r.carteiraId) ?? "?";
        const tipo = r.tipo === "entrada" ? "entrada" : "saída";
        const varMark = r.variavel ? " ~" : "";
        return `- ${r.apelido}: ${tipo} ${formatarReais(r.valorCentavos)}${varMark} todo dia ${r.diaDoMes} · ${cart} (id: ${r.id})`;
      });
      return `## Recorrentes ativos (${ativos.length})\n${linhas.join("\n")}`;
    } catch (error) {
      return `ERRO: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  if (acao === "desativar") {
    if (!deps.atualizarRecorrente || !deps.listarRecorrentes) {
      return "ERRO FATAL: desativar recorrente não está disponível.";
    }
    const idOuNome = String(args.id ?? args.apelido ?? "").trim();
    if (!idOuNome) return "ERRO: informa id ou apelido do recorrente.";
    try {
      const lista = await deps.listarRecorrentes();
      const hit = lista.find(
        (r) =>
          r.id === idOuNome ||
          r.apelido.toLowerCase() === idOuNome.toLowerCase(),
      );
      if (!hit) return `ERRO: não achei o recorrente "${idOuNome}".`;
      await deps.atualizarRecorrente(hit.id, { ativo: false });
      return `Desativei o recorrente «${hit.apelido}».`;
    } catch (error) {
      return `ERRO: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  if (acao === "criar") {
    if (!deps.criarRecorrente) {
      return "ERRO FATAL: criar recorrente não está disponível.";
    }
    const tipoRaw = String(args.tipo ?? "saida").trim().toLowerCase();
    const tipo = tipoRaw === "entrada" || tipoRaw === "saida" ? tipoRaw : null;
    if (!tipo) return 'ERRO: tipo deve ser "entrada" ou "saida".';
    const valorNum = parseValorReais(args.valor);
    const valorCentavos = deps.reaisParaCentavos(valorNum);
    if (valorCentavos < 0) return "ERRO: valor inválido.";
    const dia =
      typeof args.diaDoMes === "number"
        ? Math.round(args.diaDoMes)
        : Number(args.diaDoMes);
    if (!Number.isFinite(dia) || dia < 1 || dia > 31) {
      return "ERRO: diaDoMes deve ser 1–31.";
    }
    const apelido = String(args.apelido ?? args.descricao ?? "").trim();
    if (!apelido) return "ERRO: precisa de um apelido (ex.: Aluguel).";
    const carteira = await resolverCarteira(
      deps,
      typeof args.carteira === "string" ? args.carteira : undefined,
    );
    if (typeof carteira === "string") return carteira;
    try {
      const id = await deps.criarRecorrente({
        tipo,
        valorCentavos,
        diaDoMes: dia,
        categoria: categoriaSegura(args.categoria, tipo),
        carteiraId: carteira.id,
        apelido,
        variavel: args.variavel === true,
      });
      return `Criei o recorrente «${apelido}»: ${tipo} ${formatarReais(valorCentavos)} todo dia ${dia} em ${carteira.apelido}. (id: ${id})`;
    } catch (error) {
      return `ERRO: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  // editar
  if (!deps.atualizarRecorrente || !deps.listarRecorrentes) {
    return "ERRO FATAL: editar recorrente não está disponível.";
  }
  const idOuNome = String(args.id ?? args.apelido ?? "").trim();
  if (!idOuNome) return "ERRO: informa id (ou apelido atual) do recorrente pra editar.";
  try {
    const lista = await deps.listarRecorrentes();
    const hit = lista.find(
      (r) =>
        r.id === idOuNome ||
        r.apelido.toLowerCase() === idOuNome.toLowerCase(),
    );
    if (!hit) return `ERRO: não achei o recorrente "${idOuNome}".`;

    const patch: Parameters<NonNullable<DependenciasFinancas["atualizarRecorrente"]>>[1] =
      {};
    if (typeof args.novoApelido === "string" && args.novoApelido.trim()) {
      patch.apelido = args.novoApelido.trim();
    }
    if (args.tipo === "entrada" || args.tipo === "saida") patch.tipo = args.tipo;
    if (args.valor !== undefined) {
      const v = deps.reaisParaCentavos(parseValorReais(args.valor));
      if (v < 0) return "ERRO: valor inválido.";
      patch.valorCentavos = v;
    }
    if (args.diaDoMes !== undefined) {
      const dia = Math.round(Number(args.diaDoMes));
      if (dia < 1 || dia > 31) return "ERRO: diaDoMes inválido.";
      patch.diaDoMes = dia;
    }
    if (typeof args.categoria === "string" && args.categoria.trim()) {
      patch.categoria = categoriaSegura(args.categoria, hit.tipo);
    }
    if (typeof args.carteira === "string" && args.carteira.trim()) {
      const cart = await resolverCarteira(deps, args.carteira);
      if (typeof cart === "string") return cart;
      patch.carteiraId = cart.id;
    }
    if (typeof args.variavel === "boolean") patch.variavel = args.variavel;
    if (typeof args.ativo === "boolean") patch.ativo = args.ativo;

    if (Object.keys(patch).length === 0) {
      return "ERRO: nada pra editar — manda valor, diaDoMes, novoApelido, etc.";
    }
    await deps.atualizarRecorrente(hit.id, patch);
    return `Atualizei o recorrente «${patch.apelido ?? hit.apelido}».`;
  } catch (error) {
    return `ERRO: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function gerirCarteira(
  deps: DependenciasFinancas,
  args: Record<string, unknown>,
): Promise<string> {
  const acao = String(args.acao ?? "").trim().toLowerCase();
  if (!["criar", "editar", "arquivar", "listar"].includes(acao)) {
    return 'ERRO: acao deve ser "criar", "editar", "arquivar" ou "listar".';
  }

  if (acao === "listar") {
    try {
      const lista = await deps.listarCarteiras();
      if (lista.length === 0) return "Nenhuma carteira ativa.";
      const linhas = lista.map((c) => {
        const tipo = c.tipo ?? "conta_debito";
        return `- ${c.apelido} (${tipo}) · id: ${c.id}`;
      });
      return `## Carteiras (${lista.length})\n${linhas.join("\n")}`;
    } catch (error) {
      return `ERRO: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  if (acao === "arquivar") {
    if (!deps.arquivarCarteira) {
      return "ERRO FATAL: arquivar carteira não está disponível.";
    }
    const idOuNome = String(args.id ?? args.apelido ?? "").trim();
    if (!idOuNome) return "ERRO: informa id ou apelido da carteira.";
    try {
      const lista = await deps.listarCarteiras();
      const hit = lista.find(
        (c) =>
          c.id === idOuNome ||
          c.apelido.toLowerCase() === idOuNome.toLowerCase(),
      );
      if (!hit) return `ERRO: não achei a carteira "${idOuNome}".`;
      await deps.arquivarCarteira(hit.id);
      return `Arquivei a carteira «${hit.apelido}».`;
    } catch (error) {
      return `ERRO: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  if (acao === "criar") {
    if (!deps.criarCarteira) {
      return "ERRO FATAL: criar carteira não está disponível.";
    }
    const apelido = String(args.apelido ?? "").trim();
    if (!apelido) return "ERRO: precisa de um apelido (ex.: Nubank).";
    let tipo = String(args.tipo ?? "conta_debito").trim().toLowerCase();
    if (tipo === "credito" || tipo === "crédito") tipo = "cartao_credito";
    if (tipo === "debito" || tipo === "débito") tipo = "conta_debito";
    if (!TIPOS_CARTEIRA.has(tipo)) {
      return 'ERRO: tipo deve ser "conta_debito", "cartao_credito" ou "dinheiro".';
    }
    const saldoRaw =
      typeof args.saldoInicial === "number"
        ? args.saldoInicial
        : Number(args.saldoInicial ?? 0);
    const saldoInicialCentavos =
      Number.isFinite(saldoRaw) && saldoRaw > 0
        ? deps.reaisParaCentavos(saldoRaw)
        : 0;
    try {
      const id = await deps.criarCarteira({
        tipo,
        apelido,
        banco: typeof args.banco === "string" ? args.banco : null,
        cor: typeof args.cor === "string" ? args.cor : "grafite",
        ultimos4: typeof args.ultimos4 === "string" ? args.ultimos4 : null,
        limiteCentavos:
          tipo === "cartao_credito" && args.limite !== undefined
            ? deps.reaisParaCentavos(Number(args.limite))
            : null,
        fechamentoDia:
          tipo === "cartao_credito" && args.fechamentoDia !== undefined
            ? Math.round(Number(args.fechamentoDia))
            : null,
        vencimentoDia:
          tipo === "cartao_credito" && args.vencimentoDia !== undefined
            ? Math.round(Number(args.vencimentoDia))
            : null,
        saldoInicialCentavos,
      });
      return `Criei a carteira «${apelido}» (${tipo}). (id: ${id})`;
    } catch (error) {
      return `ERRO: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  // editar
  if (!deps.atualizarCarteira) {
    return "ERRO FATAL: editar carteira não está disponível.";
  }
  const idOuNome = String(args.id ?? args.apelido ?? "").trim();
  if (!idOuNome) return "ERRO: informa id ou apelido da carteira pra editar.";
  try {
    const lista = await deps.listarCarteiras();
    const hit = lista.find(
      (c) =>
        c.id === idOuNome ||
        c.apelido.toLowerCase() === idOuNome.toLowerCase(),
    );
    if (!hit) return `ERRO: não achei a carteira "${idOuNome}".`;
    const patch: Parameters<NonNullable<DependenciasFinancas["atualizarCarteira"]>>[1] =
      {};
    if (typeof args.novoApelido === "string" && args.novoApelido.trim()) {
      patch.apelido = args.novoApelido.trim();
    }
    if (typeof args.tipo === "string" && TIPOS_CARTEIRA.has(args.tipo)) {
      patch.tipo = args.tipo;
    }
    if (typeof args.banco === "string") patch.banco = args.banco;
    if (typeof args.cor === "string") patch.cor = args.cor;
    if (typeof args.ultimos4 === "string") patch.ultimos4 = args.ultimos4;
    if (args.saldoInicial !== undefined) {
      patch.saldoInicialCentavos = deps.reaisParaCentavos(Number(args.saldoInicial));
    }
    if (args.limite !== undefined) {
      patch.limiteCentavos = deps.reaisParaCentavos(Number(args.limite));
    }
    if (args.fechamentoDia !== undefined) {
      patch.fechamentoDia = Math.round(Number(args.fechamentoDia));
    }
    if (args.vencimentoDia !== undefined) {
      patch.vencimentoDia = Math.round(Number(args.vencimentoDia));
    }
    if (Object.keys(patch).length === 0) {
      return "ERRO: nada pra editar.";
    }
    await deps.atualizarCarteira(hit.id, patch);
    return `Atualizei a carteira «${patch.apelido ?? hit.apelido}».`;
  } catch (error) {
    return `ERRO: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function transferirEntreCarteiras(
  deps: DependenciasFinancas,
  args: Record<string, unknown>,
): Promise<string> {
  if (!deps.criarTransferencia) {
    return "ERRO FATAL: transferências não estão disponíveis neste ambiente.";
  }
  const deArg = String(args.de ?? "").trim();
  const paraArg = String(args.para ?? "").trim();
  if (!deArg || !paraArg) {
    return 'ERRO: precisa de "de" e "para" (apelido ou id das carteiras).';
  }
  const valorNum = parseValorReais(args.valor);
  const valorCentavos = deps.reaisParaCentavos(valorNum);
  if (valorCentavos <= 0) return "ERRO: valor inválido.";

  const de = await resolverCarteira(deps, deArg);
  if (typeof de === "string") return de;
  const para = await resolverCarteira(deps, paraArg);
  if (typeof para === "string") return para;
  if (de.id === para.id) {
    return "ERRO: De e Para são a mesma carteira.";
  }

  let motivo =
    typeof args.motivo === "string" ? args.motivo.trim().toLowerCase() : "ajuste";
  if (motivo === "fatura" || motivo === "pagar fatura") motivo = "pagar_fatura";
  if (!MOTIVOS_TRANSF.has(motivo)) motivo = "ajuste";

  const dataMs = parseDataBr(typeof args.data === "string" ? args.data : undefined);
  const nota = typeof args.nota === "string" ? args.nota.trim() : null;

  try {
    const id = await deps.criarTransferencia({
      deCarteiraId: de.id,
      paraCarteiraId: para.id,
      valorCentavos,
      dataMs,
      motivo,
      nota,
    });
    return `Transferi ${formatarReais(valorCentavos)} de ${de.apelido} → ${para.apelido} (${motivo}). Não conta como gasto. (id: ${id})`;
  } catch (error) {
    return `ERRO ao transferir: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function gerirMeta(
  deps: DependenciasFinancas,
  args: Record<string, unknown>,
): Promise<string> {
  const acao = String(args.acao ?? "").trim().toLowerCase();
  if (!["criar", "editar", "apagar", "listar"].includes(acao)) {
    return 'ERRO: acao deve ser "criar", "editar", "apagar" ou "listar".';
  }

  if (acao === "listar") {
    if (!deps.listarMetas) return "ERRO FATAL: listar metas não está disponível.";
    try {
      const lista = (await deps.listarMetas()).filter((m) => m.ativa);
      if (lista.length === 0) return "Nenhuma meta ativa.";
      const linhas = lista.map((m) => {
        const cat = m.categoria ? ` · ${m.categoria}` : "";
        const atual =
          m.tipo === "reserva"
            ? ` · atual ${formatarReais(m.atualCentavos)}`
            : "";
        return `- ${m.apelido}: ${m.tipo} alvo ${formatarReais(m.alvoCentavos)}${atual}${cat} (id: ${m.id})`;
      });
      return `## Metas ativas (${lista.length})\n${linhas.join("\n")}`;
    } catch (error) {
      return `ERRO: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  if (acao === "apagar") {
    if (!deps.apagarMeta || !deps.listarMetas) {
      return "ERRO FATAL: apagar meta não está disponível.";
    }
    const idOuNome = String(args.id ?? args.apelido ?? "").trim();
    if (!idOuNome) return "ERRO: informa id ou apelido da meta.";
    try {
      const lista = await deps.listarMetas();
      const hit = lista.find(
        (m) =>
          m.id === idOuNome ||
          m.apelido.toLowerCase() === idOuNome.toLowerCase(),
      );
      if (!hit) return `ERRO: não achei a meta "${idOuNome}".`;
      await deps.apagarMeta(hit.id);
      return `Apaguei a meta «${hit.apelido}».`;
    } catch (error) {
      return `ERRO: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  if (acao === "criar") {
    if (!deps.criarMeta) return "ERRO FATAL: criar meta não está disponível.";
    const apelido = String(args.apelido ?? "").trim();
    if (!apelido) return "ERRO: precisa de um apelido (ex.: Reserva viagem).";
    let tipo = String(args.tipo ?? "reserva").trim().toLowerCase();
    if (tipo === "gasto" || tipo === "teto") tipo = "gasto_mes";
    if (!TIPOS_META.has(tipo)) {
      return 'ERRO: tipo deve ser "reserva", "corte" ou "gasto_mes".';
    }
    const alvoNum = parseValorReais(args.alvo);
    const alvoCentavos = deps.reaisParaCentavos(alvoNum);
    if (alvoCentavos <= 0) return "ERRO: alvo inválido (em reais).";
    const categoria =
      typeof args.categoria === "string" ? args.categoria.trim() : "";
    if (tipo === "corte" && !categoria) {
      return "ERRO: meta de corte precisa de categoria (ex.: alimentacao).";
    }
    const atualNum =
      typeof args.atual === "number" ? args.atual : Number(args.atual ?? 0);
    const atualCentavos =
      Number.isFinite(atualNum) && atualNum > 0
        ? deps.reaisParaCentavos(atualNum)
        : 0;
    try {
      const id = await deps.criarMeta({
        apelido,
        tipo: tipo as "reserva" | "corte" | "gasto_mes",
        alvoCentavos,
        atualCentavos,
        categoria: categoria || null,
      });
      return `Criei a meta «${apelido}» (${tipo}) com alvo ${formatarReais(alvoCentavos)}. (id: ${id})`;
    } catch (error) {
      return `ERRO: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  // editar
  if (!deps.atualizarMeta || !deps.listarMetas) {
    return "ERRO FATAL: editar meta não está disponível.";
  }
  const idOuNome = String(args.id ?? args.apelido ?? "").trim();
  if (!idOuNome) return "ERRO: informa id ou apelido da meta pra editar.";
  try {
    const lista = await deps.listarMetas();
    const hit = lista.find(
      (m) =>
        m.id === idOuNome ||
        m.apelido.toLowerCase() === idOuNome.toLowerCase(),
    );
    if (!hit) return `ERRO: não achei a meta "${idOuNome}".`;
    const patch: Parameters<NonNullable<DependenciasFinancas["atualizarMeta"]>>[1] =
      {};
    if (typeof args.novoApelido === "string" && args.novoApelido.trim()) {
      patch.apelido = args.novoApelido.trim();
    }
    if (typeof args.tipo === "string" && TIPOS_META.has(args.tipo)) {
      patch.tipo = args.tipo as "reserva" | "corte" | "gasto_mes";
    }
    if (args.alvo !== undefined) {
      const v = deps.reaisParaCentavos(Number(args.alvo));
      if (v <= 0) return "ERRO: alvo inválido.";
      patch.alvoCentavos = v;
    }
    if (args.atual !== undefined) {
      const v = deps.reaisParaCentavos(Number(args.atual));
      if (v < 0) return "ERRO: atual inválido.";
      patch.atualCentavos = v;
    }
    if (typeof args.categoria === "string") {
      patch.categoria = args.categoria.trim() || null;
    }
    if (typeof args.ativa === "boolean") patch.ativa = args.ativa;
    if (Object.keys(patch).length === 0) {
      return "ERRO: nada pra editar — manda alvo, atual, novoApelido, etc.";
    }
    await deps.atualizarMeta(hit.id, patch);
    return `Atualizei a meta «${patch.apelido ?? hit.apelido}».`;
  } catch (error) {
    return `ERRO: ${error instanceof Error ? error.message : String(error)}`;
  }
}
