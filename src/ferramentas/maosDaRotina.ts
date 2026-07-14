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

export type DependenciasRotina = {
  ler: () => Promise<BlocoRotinaCore[]>;
  criar: (b: {
    titulo: string;
    dias: number[];
    inicio: number;
    fim: number;
    nota?: string;
    notificar: boolean;
  }) => Promise<string>;
  apagar: (id: string) => Promise<void>;
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

export async function verRotina(
  deps: DependenciasRotina,
  dia?: number,
): Promise<string> {
  const blocos = await deps.ler();
  if (!blocos.length) {
    return "A rotina dele está vazia — ele ainda não montou nada.";
  }

  const dias = dia !== undefined ? [dia] : [0, 1, 2, 3, 4, 5, 6];
  const linhas: string[] = [];

  for (const d of dias) {
    const doDia = blocos
      .filter((b) => b.dias.includes(d))
      .sort((a, b) => a.inicio - b.inicio);

    if (!doDia.length) {
      if (dia !== undefined) linhas.push(`${DIAS[d]}: vazia.`);
      continue;
    }

    linhas.push(
      `${DIAS[d]}:\n` +
        doDia
          .map(
            (b) =>
              `  ${hhmm(b.inicio)}–${hhmm(b.fim)}  ${b.titulo}` +
              `${b.nota ? ` (${b.nota})` : ""}` +
              `${b.origem === "luna" ? " [sugerido por ti]" : ""}  id=${b.id}`,
          )
          .join("\n"),
    );
  }

  return linhas.length ? linhas.join("\n") : "Nada marcado nesse dia.";
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

  const id = await deps.criar({
    titulo,
    dias,
    inicio,
    fim,
    nota: typeof args.nota === "string" && args.nota.trim() ? args.nota.trim() : undefined,
    notificar: args.notificar !== false,
  });

  return (
    `Criado: «${titulo}» ${hhmm(inicio)}–${hhmm(fim)}, ` +
    `${dias.map((d) => DIAS[d]).join(", ")}. Aparece na rotina dele marcado como sugerido por ti (id=${id}).`
  );
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
