import type { BlocoRotinaCore } from "../estado/neuronioRotina.js";

/**
 * As mãos dela na rotina.
 *
 * ── Porque isto existe ────────────────────────────────────────────────────────
 * Ela já LIA a rotina — sabia onde ele estava. Mas o Ethan perguntou:
 *
 *   «a Luna preenche a rotina pra você? se pedir»
 *
 * E a resposta era não. Pior: sem uma mão para escrever, quando ele pedisse «monta-me a
 * semana» ela só podia FINGIR que montou. Era o mesmo teatro do whitepaper («*abro o
 * ficheiro e leio*», sem abrir nada) — e ele apanhou o risco antes de ele acontecer.
 *
 * ── O rasto ───────────────────────────────────────────────────────────────────
 * Tudo o que ela cria nasce marcado (`origem: "luna"`) e aparece no ecrã como «sugerido pela
 * Luna». Ele apaga com um toque.
 *
 * Isto não é decoração: uma companheira que mexe na agenda de alguém tem de deixar rasto.
 * Uma alteração invisível na vida de uma pessoa não é ajuda — é intrusão, por mais bem
 * intencionada que seja.
 */

export type PassoBloco = { id: string; texto: string; feito: boolean };

/**
 * Uma tarefa DENTRO de um bloco.
 *
 * «Trabalho · 8h–17h» não é uma coisa: é um recipiente de muitas — responder emails, a
 * reunião, rever o PR. Cada uma é uma sub-tarefa, que ele risca conforme faz.
 *
 * A `hora` NÃO é enfeite (foi o que ele corrigiu): se ele a marcar com `notificar`, ela
 * cobra-o naquele horário — uma reunião às 10h dá um toque às 10h, dentro do dia de
 * trabalho. A hora que não cobra é só um lembrete visual; a que cobra é um compromisso.
 */
export type SubTarefa = {
  id: string;
  texto: string;
  feito: boolean;
  /** Minutos desde a meia-noite. Opcional — a maioria é só checklist. */
  hora?: number;
  /** Se tiver hora e isto for true, ela avisa/cobra nesse horário. */
  notificar?: boolean;
};

export type CamposBloco = {
  titulo: string;
  dias: number[];
  inicio: number;
  fim: number;
  nota?: string;
  notificar: boolean;
  /** O roteiro dela: COMO fazer a coisa. «Almoço 12h-13h» não arranca ninguém. */
  roteiro?: string;
  /** Os passos. Riscar um passo é COMEÇAR — e começar é o que não acontece sozinho. */
  passos?: PassoBloco[];
  /** As tarefas dentro do bloco (checklist com hora opcional que pode cobrar). */
  subtarefas?: SubTarefa[];
  /**
   * O guia FUNDO — a receita completa, o treino inteiro, o plano de estudo detalhado.
   *
   * Sem limite, e SÓ quando ele pede. É o contrário dos passos: os passos são o empurrão
   * mínimo para arrancar (por isso capados a 6, para não virar tutela); o guia é a
   * profundidade que ele foi buscar de propósito. Um só o protege; o outro atende.
   */
  guia?: string;
  /** Pausa com data de volta — `null` retoma. Datas ISO «YYYY-MM-DD». */
  pausa?: { de?: string; ate: string } | null;
  /**
   * A que rotina o bloco pertence. Ausente = Normal. `null` (só no editar) devolve à Normal.
   * É isto que deixa a Luna montar uma rotina alternativa INTEIRA — sem isto ela criava o
   * rótulo «Férias» e os blocos caíam todos na Normal.
   */
  setId?: string | null;
  /** Modo alarme: aviso fixo, forte, que só para quando ele marca «Comecei». */
  alarme?: boolean;
};

export type DependenciasRotina = {
  ler: () => Promise<BlocoRotinaCore[]>;
  criar: (b: CamposBloco) => Promise<string>;
  /**
   * Editar é PARCIAL de propósito.
   *
   * Sem isto, mudar a hora de um bloco obrigava-a a apagar e recriar — e nesse caminho
   * perdia-se a nota que ele tinha escrito, a cor que ele tinha escolhido, e o histórico
   * ficava com um bloco apagado onde só houve um horário mudado. Um «editar» que é um
   * «apagar + criar» disfarçado destrói coisas que ninguém lhe pediu para destruir.
   */
  editar: (id: string, campos: Partial<CamposBloco>) => Promise<void>;
  apagar: (id: string) => Promise<void>;
  // ── Rotinas alternativas ──
  lerRotinas?: () => Promise<Array<{ id: string; nome: string; de?: string; ate?: string }>>;
  criarRotina?: (r: { nome: string; de?: string; ate?: string }) => Promise<string>;
  /** Reprogramar/aplicar: mudar nome ou período. `de:null`/`ate:null` tira o período. */
  editarRotina?: (
    id: string,
    campos: { nome?: string; de?: string | null; ate?: string | null },
  ) => Promise<void>;
  apagarRotina?: (id: string) => Promise<void>;
  adicionarExtra?: (id: string, tarefas: SubTarefa[]) => Promise<void>;
  /** Remove UMA tarefa de HOJE (por id), não do molde. */
  removerExtra?: (id: string, taskId: string) => Promise<void>;
  /** DEFINE a lista inteira das tarefas de HOJE (substitui — permite reordenar). */
  definirExtras?: (id: string, tarefas: SubTarefa[]) => Promise<void>;
};

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function horaParaMinuto(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!m) return null;

  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;

  return h * 60 + min;
}

// ── ver_rotina ────────────────────────────────────────────────────────────────

const DIAS_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/**
 * Descreve um bloco por INTEIRO — e isto é o conserto de um buraco real.
 *
 * O Ethan pediu à Luna para refazer a rotina «com as melhorias que fiz». Ela olhou (ver_rotina),
 * mas o ver_rotina só mostrava título + hora + nota — cego para as subtarefas, os passos, o
 * alarme e a rotina a que o bloco pertence. Então ela disse, honestamente, que «não via» o que
 * ele mudou. E era verdade: os olhos dela não alcançavam o detalhe. Sem VER a rotina inteira,
 * ela não a pode reconstruir. Aqui ela passa a ver tudo.
 */
function descreverBloco(b: BlocoRotinaCore, comDias: boolean): string {
  const linhas = [
    `  ${hhmm(b.inicio)}–${hhmm(b.fim)}  ${b.titulo}` +
      `${b.alarme ? " ⏰[alarme]" : ""}` +
      `${b.origem === "luna" ? " [sugerido por ti]" : ""}  id=${b.id}`,
  ];
  if (comDias) linhas.push(`     dias: ${b.dias.map((d) => DIAS_CURTO[d]).join(", ") || "nenhum"}`);
  if (b.pausa?.ate) linhas.push(`     pausado até ${b.pausa.ate}`);
  if (b.nota) linhas.push(`     nota: ${b.nota}`);
  if (b.roteiro) {
    const r = b.roteiro.trim().replace(/\s+/g, " ");
    linhas.push(`     roteiro: «${r.length > 160 ? r.slice(0, 160) + "…" : r}»`);
  }
  if (b.passos?.length) {
    linhas.push(`     passos: ${b.passos.map((p) => p.texto).join(" · ")}`);
  }
  // O id vai junto (curto): é por ele que o `organizar_tarefas` mantém a tarefa (e o «feito»)
  // ao reordenar/renomear. Sem id = tarefa nova.
  const descreverTarefa = (t: { id: string; texto: string; feito: boolean; hora?: number; notificar?: boolean }) =>
    `       - ${t.feito ? "✓ " : ""}${t.texto}` +
    (t.hora !== undefined ? ` (${hhmm(t.hora)}${t.notificar ? ", cobra" : ""})` : "") +
    `  [${t.id}]`;
  // As de HOJE (as peças do dia) — o que ela reorganiza quando ele pede das «de hoje».
  if (b.tarefasHoje?.length) {
    linhas.push(`     tarefas de HOJE:`, ...b.tarefasHoje.map(descreverTarefa));
  }
  // As FIXAS (o molde que se repete todo dia).
  if (b.subtarefas?.length) {
    linhas.push(`     tarefas FIXAS (todo dia):`, ...b.subtarefas.map(descreverTarefa));
  }
  return linhas.join("\n");
}

export async function verRotina(
  deps: DependenciasRotina,
  dia?: number,
): Promise<string> {
  const blocos = await deps.ler();
  if (!blocos.length) {
    return "A rotina dele está vazia — ele ainda não montou nada.";
  }

  // ── Um dia só: a grade daquele dia, com o detalhe todo ──
  if (dia !== undefined) {
    const doDia = blocos.filter((b) => b.dias.includes(dia)).sort((a, b) => a.inicio - b.inicio);
    if (!doDia.length) return `${DIAS[dia]}: vazia.`;
    return `${DIAS[dia]}:\n` + doDia.map((b) => descreverBloco(b, false)).join("\n");
  }

  // ── A semana inteira: cada bloco UMA vez (não 7×), agrupado por rotina, com tudo. É esta
  //    visão completa que ela precisa para reconstruir a rotina dele fielmente. ──
  const nomes = new Map<string, string>();
  if (deps.lerRotinas) {
    for (const r of await deps.lerRotinas()) nomes.set(r.id, r.nome);
  }

  const porRotina = new Map<string, BlocoRotinaCore[]>();
  for (const b of blocos) {
    const chave = b.setId ?? "__normal__";
    (porRotina.get(chave) ?? porRotina.set(chave, []).get(chave)!).push(b);
  }

  const secoes: string[] = [];
  for (const [chave, bs] of porRotina) {
    const titulo = chave === "__normal__" ? "Normal" : `Rotina «${nomes.get(chave) ?? chave}»`;
    const ordenados = bs.sort((a, b) => a.inicio - b.inicio);
    secoes.push(`── ${titulo} ──\n` + ordenados.map((b) => descreverBloco(b, true)).join("\n"));
  }

  return secoes.join("\n\n");
}

// ── criar_bloco ───────────────────────────────────────────────────────────────

export async function criarBloco(
  deps: DependenciasRotina,
  args: Record<string, unknown>,
): Promise<string> {
  const titulo = String(args.titulo ?? "").trim();
  const dias = Array.isArray(args.dias) ? args.dias.map(Number).filter((d) => d >= 0 && d <= 6) : [];
  const inicio = horaParaMinuto(String(args.inicio ?? ""));
  const fim = horaParaMinuto(String(args.fim ?? ""));

  // Erros DEVOLVIDOS a ela, não lançados. Uma ferramenta que rebenta deixa-a sem saber o que
  // correu mal — e ela acaba a dizer ao Ethan que criou o bloco. A mensagem de erro é a única
  // coisa que a impede de mentir por ignorância.
  if (!titulo) return "ERRO: o bloco precisa de um título. Nada foi criado.";
  if (!dias.length) return "ERRO: escolhe pelo menos um dia (0=domingo … 6=sábado). Nada foi criado.";
  if (inicio === null) return "ERRO: hora de início inválida (usa «HH:MM», ex.: «07:30»). Nada foi criado.";
  if (fim === null) return "ERRO: hora de fim inválida (usa «HH:MM»). Nada foi criado.";
  if (fim <= inicio) return "ERRO: o fim tem de ser depois do início. Nada foi criado.";

  // Não pisar o que já lá está. Ela vê o conflito e decide — não é o sistema que decide por
  // ela, mas também não a deixa criar uma sobreposição sem dar por isso.
  const existentes = await deps.ler();
  const choque = existentes.find(
    (b) => b.dias.some((d) => dias.includes(d)) && inicio < b.fim && fim > b.inicio,
  );
  if (choque) {
    return (
      `ERRO: isso choca com «${choque.titulo}» (${hhmm(choque.inicio)}–${hhmm(choque.fim)}). ` +
      `Nada foi criado — escolhe outra hora, ou pergunta-lhe se quer substituir.`
    );
  }

  // Em qual rotina? Se ela deu um nome, resolvemo-lo para o setId. Assim «monta a rotina de
  // férias com praia e leitura» põe os blocos DENTRO de Férias — não na Normal.
  const resolvido = await resolverSetId(deps, args.rotina);
  if (resolvido.erro) return resolvido.erro;

  const id = await deps.criar({
    titulo,
    dias,
    inicio,
    fim,
    nota: typeof args.nota === "string" && args.nota.trim() ? args.nota.trim() : undefined,
    notificar: args.notificar !== false,
    ...(resolvido.setId ? { setId: resolvido.setId } : {}),
    ...(args.alarme === true ? { alarme: true } : {}),
  });

  return (
    `Criado: «${titulo}» ${hhmm(inicio)}–${hhmm(fim)}, ` +
    `${dias.map((d) => DIAS[d]).join(", ")}` +
    `${resolvido.nome ? `, na rotina «${resolvido.nome}»` : ""}` +
    `${args.alarme === true ? ", em modo alarme" : ""}. ` +
    `Aparece na rotina dele marcado como sugerido por ti (id=${id}).`
  );
}

/**
 * Resolve o nome de uma rotina (o que a Luna diz — «férias») para o `setId` real.
 *
 * `undefined`/vazio = Normal (setId ausente). «normal» explícito = devolver à Normal (setId
 * null, só faz sentido no editar). Um nome que não existe é ERRO devolvido — nunca criar o
 * bloco «no escuro» numa rotina inventada.
 */
async function resolverSetId(
  deps: DependenciasRotina,
  bruto: unknown,
): Promise<{ setId?: string | null; nome?: string; erro?: string }> {
  const chave = typeof bruto === "string" ? bruto.trim() : "";
  if (!chave) return {};
  if (chave.toLowerCase() === "normal") return { setId: null, nome: "Normal" };

  if (!deps.lerRotinas) return { erro: "ERRO: rotinas alternativas não estão disponíveis aqui. Nada foi feito." };
  const sets = await deps.lerRotinas();
  const alvo =
    sets.find((r) => r.id === chave) ??
    sets.find((r) => r.nome.toLowerCase() === chave.toLowerCase()) ??
    sets.find((r) => r.nome.toLowerCase().includes(chave.toLowerCase()));

  if (!alvo) {
    return {
      erro:
        `ERRO: não existe rotina «${chave}». Cria-a primeiro (criar_rotina) ou usa ver_rotinas ` +
        `para ver os nomes certos. Nada foi feito.`,
    };
  }
  return { setId: alvo.id, nome: alvo.nome };
}

// ── editar_bloco ──────────────────────────────────────────────────────────────

/**
 * Editar muda SÓ o que ela mandou mudar.
 *
 * Se ela só disser «muda o duolingo para as 8h», o título, os dias, a nota e o aviso ficam
 * exatamente como estavam. Um editar que substitui o bloco inteiro pelos campos que vieram
 * apagaria, em silêncio, tudo o que ela não mencionou — e ele descobriria dias depois que a
 * nota que tinha escrito desapareceu quando pediu para mudar uma hora.
 */
export async function editarBloco(
  deps: DependenciasRotina,
  args: Record<string, unknown>,
): Promise<string> {
  const id = String(args.bloco_id ?? "").trim();
  if (!id) return "ERRO: falta o id do bloco (vê `ver_rotina` primeiro). Nada foi alterado.";

  const blocos = await deps.ler();
  const alvo = blocos.find((b) => b.id === id);
  if (!alvo) return `ERRO: não existe bloco com id «${id}». Nada foi alterado.`;

  const campos: Partial<CamposBloco> = {};
  const mudancas: string[] = [];

  if (typeof args.titulo === "string" && args.titulo.trim()) {
    campos.titulo = args.titulo.trim();
    mudancas.push(`nome → «${campos.titulo}»`);
  }

  if (Array.isArray(args.dias)) {
    const dias = args.dias.map(Number).filter((d) => d >= 0 && d <= 6);
    if (!dias.length) return "ERRO: os dias têm de ser 0–6 (0=domingo). Nada foi alterado.";
    campos.dias = dias;
    mudancas.push(`dias → ${dias.map((d) => DIAS[d]).join(", ")}`);
  }

  if (args.inicio !== undefined) {
    const m = horaParaMinuto(String(args.inicio));
    if (m === null) return "ERRO: hora de início inválida («HH:MM»). Nada foi alterado.";
    campos.inicio = m;
  }

  if (args.fim !== undefined) {
    const m = horaParaMinuto(String(args.fim));
    if (m === null) return "ERRO: hora de fim inválida («HH:MM»). Nada foi alterado.";
    campos.fim = m;
  }

  if (typeof args.nota === "string") {
    campos.nota = args.nota.trim() || undefined;
    mudancas.push("nota");
  }

  if (typeof args.notificar === "boolean") {
    campos.notificar = args.notificar;
    mudancas.push(campos.notificar ? "volta a cobrar" : "deixa de cobrar");
  }

  if (typeof args.alarme === "boolean") {
    campos.alarme = args.alarme;
    mudancas.push(campos.alarme ? "modo alarme ligado" : "modo alarme desligado");
  }

  if (args.rotina !== undefined) {
    const resolvido = await resolverSetId(deps, args.rotina);
    if (resolvido.erro) return resolvido.erro;
    // `null` devolve à Normal; um id move para a alternativa.
    campos.setId = resolvido.setId ?? null;
    mudancas.push(`movido para «${resolvido.nome ?? "Normal"}»`);
  }

  if (!Object.keys(campos).length) {
    return "ERRO: não disseste o que mudar. Nada foi alterado.";
  }

  // O horário resultante é o novo MISTURADO com o antigo — não só o que veio.
  const inicio = campos.inicio ?? alvo.inicio;
  const fim = campos.fim ?? alvo.fim;
  const dias = campos.dias ?? alvo.dias;

  if (fim <= inicio) return "ERRO: o fim ficaria antes do início. Nada foi alterado.";

  if (campos.inicio !== undefined || campos.fim !== undefined) {
    mudancas.push(`horário → ${hhmm(inicio)}–${hhmm(fim)}`);
  }

  // O choque ignora o PRÓPRIO bloco — senão ele chocaria sempre consigo mesmo.
  const choque = blocos.find(
    (b) => b.id !== id && b.dias.some((d) => dias.includes(d)) && inicio < b.fim && fim > b.inicio,
  );
  if (choque) {
    return (
      `ERRO: assim choca com «${choque.titulo}» (${hhmm(choque.inicio)}–${hhmm(choque.fim)}). ` +
      `Nada foi alterado.`
    );
  }

  await deps.editar(id, campos);

  return `Alterado «${alvo.titulo}»: ${mudancas.join(", ")}.`;
}

// ── apagar_bloco ──────────────────────────────────────────────────────────────

export async function apagarBlocoRotina(
  deps: DependenciasRotina,
  args: Record<string, unknown>,
): Promise<string> {
  const id = String(args.bloco_id ?? "").trim();
  if (!id) return "ERRO: falta o id do bloco (vê `ver_rotina` primeiro). Nada foi apagado.";

  const blocos = await deps.ler();
  const alvo = blocos.find((b) => b.id === id);
  if (!alvo) return `ERRO: não existe bloco com id «${id}». Nada foi apagado.`;

  await deps.apagar(id);
  return `Apagado: «${alvo.titulo}».`;
}

// ── detalhar_bloco ────────────────────────────────────────────────────────────

/**
 * O roteiro e o guia — o texto que ajuda a arrancar/aprofundar. (As TAREFAS saíram daqui: são
 * do `organizar_tarefas` agora. O Ethan apanhou a estranheza de passo e subtarefa serem a mesma
 * coisa em duas listas — então há uma via só pras tarefas, e esta ferramenta só escreve texto.)
 *
 * O `roteiro` é o COMO curto (arranca o TDAH: «Almoço 12h-13h» não arranca; «descongela o frango»
 * arranca). O `guia` é o fundo — a receita/treino inteiro, só quando ele pede.
 */
export async function detalharBloco(
  deps: DependenciasRotina,
  args: Record<string, unknown>,
): Promise<string> {
  const id = String(args.bloco_id ?? "").trim();
  if (!id) return "ERRO: falta o id do bloco (vê `ver_rotina`). Nada foi escrito.";

  const blocos = await deps.ler();
  const alvo = blocos.find((b) => b.id === id);
  if (!alvo) return `ERRO: não existe bloco com id «${id}». Nada foi escrito.`;

  const roteiro = typeof args.roteiro === "string" ? args.roteiro.trim() : undefined;
  const guia = typeof args.guia === "string" ? args.guia.trim() : undefined;

  if (!roteiro && !guia) {
    return "ERRO: não disseste roteiro nem guia. (Pra tarefas, usa `organizar_tarefas`.) Nada foi escrito.";
  }

  await deps.editar(id, {
    ...(roteiro ? { roteiro } : {}),
    ...(guia ? { guia } : {}),
  });

  const partes = [roteiro ? "roteiro" : "", guia ? "guia completo" : ""].filter(Boolean);
  return `Escrito em «${alvo.titulo}»: ${partes.join(" + ")}. Ele vê isto ao tocar no bloco.`;
}

// ── organizar_tarefas ─────────────────────────────────────────────────────────

/**
 * A via ÚNICA pra mexer nas tarefas de um bloco: a Luna DECLARA a lista nova, o servidor CONCILIA.
 *
 * ── Porque isto substituiu adicionar/remover_subtarefa ────────────────────────
 * O Ethan achou o fluxo antigo estranho: pra reorganizar um bloco, ela chamava remover×N +
 * adicionar×N, rastreando id por id, e NÃO conseguia reordenar. Aqui ela pensa em LISTA — manda
 * as fixas e/ou as de hoje na ordem que quer, cada item com o `id` (pra manter) ou só texto (nova)
 * — e o servidor faz o trabalho chato: preserva ids e o «feito», renomeia, reordena, some e cria.
 *
 * ── A rede (o risco da lista parcial) ─────────────────────────────────────────
 * Declarar uma lista PARCIAL apagaria o resto. Contra isso: o resultado RELATA o que somou/tirou/
 * reordenou (nada silencioso), e a ferramenta RECUSA esvaziar uma lista sem `limpar: true`.
 */
export const MAX_SUBTAREFAS = 20;

type ItemDesejado = {
  id?: string;
  texto?: string;
  hora?: string | number;
  notificar?: boolean;
  feito?: boolean;
};

type ResultadoConciliacao = {
  nova: SubTarefa[];
  adicionadas: string[];
  removidas: string[];
  renomeadas: number;
  reordenou: boolean;
};

/** Concilia a lista desejada com a atual: mantém por id (preserva feito), renomeia, reordena, cria, remove. */
function conciliarLista(
  desejadas: ItemDesejado[],
  atuais: SubTarefa[],
  bloco: { inicio: number; fim: number },
): ResultadoConciliacao {
  const porId = new Map(atuais.map((t) => [t.id, t]));
  const usados = new Set<string>();
  const nova: SubTarefa[] = [];
  const adicionadas: string[] = [];
  let renomeadas = 0;

  for (const d of desejadas) {
    const texto = typeof d.texto === "string" ? d.texto.trim() : "";
    const existente = d.id ? porId.get(d.id) : undefined;

    // A hora (se veio): só vale dentro do bloco pai — fora dele, um toque chega quando ele já saiu.
    let hora: number | undefined = existente?.hora;
    let notificar: boolean | undefined = existente?.notificar;
    if (d.hora !== undefined && String(d.hora).trim() !== "") {
      const m = typeof d.hora === "number" ? d.hora : horaParaMinuto(String(d.hora));
      if (m !== null && m >= bloco.inicio && m <= bloco.fim) {
        hora = m;
        notificar = d.notificar === true;
      }
    }

    if (existente) {
      usados.add(existente.id);
      if (texto && texto !== existente.texto) renomeadas += 1;
      nova.push({
        id: existente.id,
        texto: texto || existente.texto,
        feito: d.feito ?? existente.feito,
        ...(hora !== undefined ? { hora } : {}),
        ...(hora !== undefined && notificar ? { notificar: true } : {}),
      });
    } else if (texto) {
      nova.push({
        id: `st${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
        texto,
        feito: d.feito === true,
        ...(hora !== undefined ? { hora } : {}),
        ...(hora !== undefined && d.notificar === true ? { notificar: true } : {}),
      });
      adicionadas.push(texto);
    }
    // item sem id conhecido e sem texto → ignorado (nada a fazer)
  }

  const removidas = atuais.filter((t) => !usados.has(t.id)).map((t) => t.texto);
  const ordemAntes = atuais.filter((t) => usados.has(t.id)).map((t) => t.id).join(",");
  const ordemDepois = nova.filter((t) => usados.has(t.id)).map((t) => t.id).join(",");
  return { nova, adicionadas, removidas, renomeadas, reordenou: ordemAntes !== ordemDepois };
}

function resumirConciliacao(rotulo: string, r: ResultadoConciliacao): string {
  const p: string[] = [];
  if (r.adicionadas.length) p.push(`+${r.adicionadas.length}`);
  if (r.removidas.length) p.push(`−${r.removidas.length} (${r.removidas.join(", ")})`);
  if (r.renomeadas) p.push(`${r.renomeadas} renomeada(s)`);
  if (r.reordenou) p.push("reordenou");
  return `${rotulo}: ${p.length ? p.join(", ") : "sem mudança"}`;
}

export async function organizarTarefas(
  deps: DependenciasRotina,
  args: Record<string, unknown>,
): Promise<string> {
  const id = String(args.bloco_id ?? "").trim();
  if (!id) return "ERRO: falta o id do bloco (vê `ver_rotina`). Nada foi mexido.";

  const blocos = await deps.ler();
  const alvo = blocos.find((b) => b.id === id);
  if (!alvo) return `ERRO: não existe bloco com id «${id}». Nada foi mexido.`;

  const temFixas = Array.isArray(args.fixas);
  const temHoje = Array.isArray(args.hoje);
  if (!temFixas && !temHoje) {
    return "ERRO: diz `fixas` (o molde de todo dia) e/ou `hoje` (só hoje) — cada uma é a LISTA INTEIRA na ordem que queres. Nada foi mexido.";
  }
  const limpar = args.limpar === true;
  const partes: string[] = [];

  if (temFixas) {
    const desejadas = args.fixas as ItemDesejado[];
    if (!desejadas.length && !limpar && (alvo.subtarefas?.length ?? 0) > 0) {
      return "ERRO: a lista `fixas` veio vazia. Se é mesmo pra apagar TODAS as fixas, repete com `limpar: true`. Nada foi mexido.";
    }
    if (desejadas.length > MAX_SUBTAREFAS) {
      return `ERRO: são ${desejadas.length} fixas, o teto é ${MAX_SUBTAREFAS}. Nada foi mexido.`;
    }
    const r = conciliarLista(desejadas, alvo.subtarefas ?? [], alvo);
    await deps.editar(id, { subtarefas: r.nova });
    partes.push(resumirConciliacao("fixas", r));
  }

  if (temHoje) {
    if (!deps.definirExtras) {
      return "ERRO: não consigo mexer nas tarefas de hoje neste ambiente. Nada foi mexido nas de hoje.";
    }
    const desejadas = args.hoje as ItemDesejado[];
    if (!desejadas.length && !limpar && (alvo.tarefasHoje?.length ?? 0) > 0) {
      return "ERRO: a lista `hoje` veio vazia. Se é mesmo pra apagar TODAS as de hoje, repete com `limpar: true`. Nada foi mexido.";
    }
    const r = conciliarLista(desejadas, alvo.tarefasHoje ?? [], alvo);
    await deps.definirExtras(id, r.nova);
    partes.push(resumirConciliacao("hoje", r));
  }

  return `Organizei «${alvo.titulo}» — ${partes.join(" · ")}. Ele vê na hora.`;
}

// ── pausar / retomar ──────────────────────────────────────────────────────────

/** Aceita «2026-03-03», e também «03/03» assumindo o próximo ano/mês que faça sentido. */
function normalizarData(bruto: string): string | null {
  const t = bruto.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

  const br = /^(\d{1,2})[/](\d{1,2})(?:[/](\d{2,4}))?$/.exec(t);
  if (br) {
    const dia = br[1].padStart(2, "0");
    const mes = br[2].padStart(2, "0");
    const ano = br[3] ? (br[3].length === 2 ? `20${br[3]}` : br[3]) : String(new Date().getFullYear());
    return `${ano}-${mes}-${dia}`;
  }
  return null;
}

/**
 * Pausa um bloco (ou todos) até uma data.
 *
 * «o curso pegou férias até março», «tô de férias até dia 20 — pausa tudo». Enquanto pausado,
 * o bloco sai da grade, não cobra, e não conta como sumiço. Volta sozinho na data.
 */
export async function pausarBloco(
  deps: DependenciasRotina,
  args: Record<string, unknown>,
): Promise<string> {
  const ateBruto = String(args.ate ?? "").trim();
  if (!ateBruto) return "ERRO: falta a data de volta («ate»). Nada foi pausado.";

  const ate = normalizarData(ateBruto);
  if (!ate) return `ERRO: não entendi a data «${ateBruto}» (usa «YYYY-MM-DD» ou «DD/MM»). Nada foi pausado.`;

  const de = args.de ? normalizarData(String(args.de)) ?? undefined : undefined;
  const pausa = { ...(de ? { de } : {}), ate };

  const blocos = await deps.ler();

  // «pausa tudo» / férias: sem bloco_id, pausa todos.
  if (!String(args.bloco_id ?? "").trim()) {
    if (!blocos.length) return "A rotina está vazia — nada para pausar.";
    for (const b of blocos) await deps.editar(b.id, { pausa });
    return `Rotina inteira em pausa até ${ate}. Volta sozinha nesse dia — não vou cobrar nada até lá.`;
  }

  // Aceita id OU título. Sem o «tem de ver a rotina primeiro para saber o id», ela pausa
  // numa tacada só — e é isso que corta o ponto de fuga onde ela às vezes parava depois do
  // ver_rotina e narrava «pausei» sem pausar (medido: 3/4).
  const chave = String(args.bloco_id).trim();
  const alvo =
    blocos.find((b) => b.id === chave) ??
    blocos.find((b) => b.titulo.toLowerCase().includes(chave.toLowerCase()));
  if (!alvo) return `ERRO: não encontrei o bloco «${chave}». Nada foi pausado.`;

  await deps.editar(alvo.id, { pausa });
  return `«${alvo.titulo}» em pausa até ${ate}. Sai da grade e não cobra até lá — volta sozinho.`;
}

/** Retoma um bloco (ou todos) antes da data. */
export async function retomarBloco(
  deps: DependenciasRotina,
  args: Record<string, unknown>,
): Promise<string> {
  const blocos = await deps.ler();

  if (!String(args.bloco_id ?? "").trim()) {
    const pausados = blocos.filter((b) => b.pausa?.ate);
    if (!pausados.length) return "Nada está em pausa.";
    for (const b of pausados) await deps.editar(b.id, { pausa: null });
    return `Retomei tudo (${pausados.length} bloco(s)). A rotina voltou ao normal.`;
  }

  const chave = String(args.bloco_id).trim();
  const alvo =
    blocos.find((b) => b.id === chave) ??
    blocos.find((b) => b.titulo.toLowerCase().includes(chave.toLowerCase()));
  if (!alvo) return `ERRO: não encontrei o bloco «${chave}». Nada mudou.`;
  if (!alvo.pausa?.ate) return `«${alvo.titulo}» já está ativo.`;

  await deps.editar(alvo.id, { pausa: null });
  return `«${alvo.titulo}» retomado — voltou à grade.`;
}

// ── criar_rotina / ver_rotinas ────────────────────────────────────────────────
//
// Substituem a pausa por-bloco (que ela confabulava). «cria uma rotina de férias de 20 a 3»
// → uma rotina alternativa com período, que assume na data e devolve a Normal no fim. É
// determinístico: a troca é uma data, não um pedido que ela pode esquecer de cumprir.

export async function verRotinas(deps: DependenciasRotina): Promise<string> {
  if (!deps.lerRotinas) return "As rotinas alternativas não estão disponíveis aqui.";
  const sets = await deps.lerRotinas();
  if (!sets.length) return "Ele só tem a rotina Normal — nenhuma alternativa ainda.";
  return (
    "Rotinas dele:\n- Normal (a de sempre)\n" +
    sets
      .map(
        (r) =>
          `- «${r.nome}»${r.de && r.ate ? ` (${r.de} → ${r.ate})` : " (sem período — trocada à mão)"}  id=${r.id}`,
      )
      .join("\n")
  );
}

export async function criarRotinaAlternativa(
  deps: DependenciasRotina,
  args: Record<string, unknown>,
): Promise<string> {
  if (!deps.criarRotina) return "ERRO: não consigo criar rotinas neste ambiente. Nada foi criado.";

  const nome = String(args.nome ?? "").trim();
  if (!nome) return "ERRO: a rotina precisa de um nome. Nada foi criado.";

  const de = args.de ? normalizarData(String(args.de)) ?? undefined : undefined;
  const ate = args.ate ? normalizarData(String(args.ate)) ?? undefined : undefined;

  if ((args.de && !de) || (args.ate && !ate)) {
    return "ERRO: data inválida (usa «YYYY-MM-DD» ou «DD/MM»). Nada foi criado.";
  }
  if (de && ate && ate < de) return "ERRO: o fim tem de ser depois do início. Nada foi criado.";

  const id = await deps.criarRotina({ nome, de, ate });
  const periodo = de && ate ? `${de} → ${ate}` : "sem período (ele troca à mão)";
  return `Criei a rotina «${nome}» (${periodo}), id=${id}. Ela aparece na faixa de rotinas dele; os blocos que ele puser lá só valem nesse período.`;
}

/** Acha uma rotina alternativa pelo nome ou id (para editar/apagar). */
async function acharRotina(
  deps: DependenciasRotina,
  bruto: unknown,
): Promise<{ id: string; nome: string; de?: string; ate?: string } | null> {
  if (!deps.lerRotinas) return null;
  const chave = typeof bruto === "string" ? bruto.trim().toLowerCase() : "";
  if (!chave) return null;
  const sets = await deps.lerRotinas();
  return (
    sets.find((r) => r.id.toLowerCase() === chave) ??
    sets.find((r) => r.nome.toLowerCase() === chave) ??
    sets.find((r) => r.nome.toLowerCase().includes(chave)) ??
    null
  );
}

/**
 * Reprogramar/APLICAR uma rotina alternativa — mudar o nome ou o período.
 *
 * «aplica as férias essa semana» = pôr o período de hoje a domingo. «adia as férias pra dia
 * 25» = mudar o `de`. «tira a data das provas» = `sem_periodo`, e passa a trocar à mão. É
 * aqui que «aplicar» acontece: a rotina vigora por causa do período, então reprogramar o
 * período É aplicar — determinístico, sem um estado escondido de «ativa» que se perde.
 */
export async function editarRotinaAlternativa(
  deps: DependenciasRotina,
  args: Record<string, unknown>,
): Promise<string> {
  if (!deps.editarRotina) return "ERRO: não consigo editar rotinas neste ambiente. Nada mudou.";

  const alvo = await acharRotina(deps, args.rotina ?? args.nome);
  if (!alvo) return `ERRO: não encontrei a rotina «${String(args.rotina ?? args.nome ?? "")}». Nada mudou.`;

  const campos: { nome?: string; de?: string | null; ate?: string | null } = {};
  const mudancas: string[] = [];

  if (typeof args.novo_nome === "string" && args.novo_nome.trim()) {
    campos.nome = args.novo_nome.trim();
    mudancas.push(`nome → «${campos.nome}»`);
  }

  if (args.sem_periodo === true) {
    campos.de = null;
    campos.ate = null;
    mudancas.push("sem período (passa a trocar à mão)");
  } else {
    const de = args.de ? normalizarData(String(args.de)) : undefined;
    const ate = args.ate ? normalizarData(String(args.ate)) : undefined;
    if ((args.de && !de) || (args.ate && !ate)) {
      return "ERRO: data inválida (usa «YYYY-MM-DD» ou «DD/MM»). Nada mudou.";
    }
    const deFinal = de ?? alvo.de;
    const ateFinal = ate ?? alvo.ate;
    if (deFinal && ateFinal && ateFinal < deFinal) {
      return "ERRO: o fim ficaria antes do início. Nada mudou.";
    }
    if (de) {
      campos.de = de;
      mudancas.push(`início → ${de}`);
    }
    if (ate) {
      campos.ate = ate;
      mudancas.push(`fim → ${ate}`);
    }
  }

  if (!Object.keys(campos).length) return "ERRO: não disseste o que mudar na rotina. Nada mudou.";

  await deps.editarRotina(alvo.id, campos);
  return `Rotina «${alvo.nome}» reprogramada: ${mudancas.join(", ")}.`;
}

/** Apaga uma rotina alternativa. Os blocos dela ficam órfãos — o app trata-os como Normal. */
export async function apagarRotinaAlternativa(
  deps: DependenciasRotina,
  args: Record<string, unknown>,
): Promise<string> {
  if (!deps.apagarRotina) return "ERRO: não consigo apagar rotinas neste ambiente. Nada foi apagado.";

  const alvo = await acharRotina(deps, args.rotina ?? args.nome);
  if (!alvo) return `ERRO: não encontrei a rotina «${String(args.rotina ?? args.nome ?? "")}». Nada foi apagado.`;

  await deps.apagarRotina(alvo.id);
  return `Apaguei a rotina «${alvo.nome}». Os blocos que estavam nela voltam a contar como Normal.`;
}
