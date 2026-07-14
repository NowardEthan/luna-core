/**
 * Neurónio de rotina — «onde é que ele está, agora?»
 *
 * ── O que isto muda ───────────────────────────────────────────────────────────
 * Ela já sabia as HORAS (o bloco `tempo` do briefing). Passa a saber o DIA DELE:
 *
 *   hoje: «são 8h40 de segunda»
 *   agora: «são 8h40, e ele está no ônibus a fazer o duolingo — faltam-lhe 20 minutos
 *           para o trabalho»
 *
 * A primeira é um relógio. A segunda é alguém que sabe onde tu estás. E é a diferença
 * inteira entre o Orbit e um app de horários com um chat colado por cima.
 *
 * ── Uma regra que importa mais do que parece ─────────────────────────────────
 * Isto é ESTADO, não uma ordem. O briefing diz-lhe onde ele está; não lhe diz para comentar
 * a agenda. Uma companheira que comenta o horário a cada mensagem não é uma companheira: é
 * um despertador com opinião.
 *
 * Por isso o bloco só existe quando há algo verdadeiramente perto (o que está a acontecer
 * agora, ou o que começa nas próximas horas). Fora disso, o silêncio é o comportamento
 * certo — e o silêncio consegue-se não escrevendo nada, não pedindo que ela se cale.
 */

export type BlocoRotinaCore = {
  id: string;
  titulo: string;
  dias: number[]; // 0 = domingo … 6 = sábado
  inicio: number; // minutos desde a meia-noite
  fim: number;
  nota?: string;
  origem?: "ethan" | "luna";
};

export type EstadoRotina = {
  atual?: BlocoRotinaCore;
  faltamMinutos?: number;
  proximo?: BlocoRotinaCore;
  emMinutos?: number;
  livreMinutos?: number;
};

const hora = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function duracao(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  return resto === 0 ? `${h}h` : `${h}h${String(resto).padStart(2, "0")}`;
}

/**
 * O mesmo cálculo que corre no telemóvel (`orbit-mobile/src/lib/routine/agora.ts`).
 *
 * Duas cópias da mesma lógica é uma dívida, e eu sei. A alternativa — um pacote partilhado
 * entre um app Expo e um servidor Node — custava mais hoje do que esta duplicação vai custar
 * durante um bom tempo. Fica escrito para quando deixar de ser verdade: se estas duas
 * divergirem, o ecrã diz uma coisa e a Luna diz outra, e ela passa a mentir sobre a vida
 * dele com toda a confiança.
 */
export function estadoDaRotina(
  blocos: BlocoRotinaCore[],
  dia: number,
  minutoAtual: number,
): EstadoRotina {
  const hoje = blocos.filter((b) => b.dias.includes(dia)).sort((a, b) => a.inicio - b.inicio);

  const atual = hoje.find((b) => minutoAtual >= b.inicio && minutoAtual < b.fim);
  const proximo = hoje.find((b) => b.inicio > minutoAtual);

  if (atual) {
    return {
      atual,
      faltamMinutos: atual.fim - minutoAtual,
      proximo,
      emMinutos: proximo ? proximo.inicio - minutoAtual : undefined,
    };
  }

  if (proximo) {
    return {
      proximo,
      emMinutos: proximo.inicio - minutoAtual,
      livreMinutos: proximo.inicio - minutoAtual,
    };
  }

  return {};
}

/** A partir de quando é que vale a pena ela saber. Mais longe do que isto é ruído. */
const HORIZONTE_MINUTOS = 180;

/**
 * O bloco do briefing. `null` = não há nada a dizer, e nada é escrito.
 *
 * Repare no que NÃO está aqui: nenhum «comenta isto», nenhum «lembra-o da lição». Ela recebe
 * o facto. O que faz com ele — se puxa o assunto, se fica calada, se faz uma piada — é dela.
 */
export function blocoRotina(e: EstadoRotina): string | null {
  if (e.atual) {
    const linhas = [
      `Ele está agora em «${e.atual.titulo}» — faltam ${duracao(e.faltamMinutos ?? 0)}.`,
    ];
    if (e.atual.nota) linhas.push(`Nota dele nesse bloco: ${e.atual.nota}`);
    if (e.proximo && (e.emMinutos ?? 0) <= 120) {
      linhas.push(`A seguir: «${e.proximo.titulo}», às ${hora(e.proximo.inicio)}.`);
    }
    return linhas.join("\n");
  }

  if (e.proximo && (e.emMinutos ?? 0) <= HORIZONTE_MINUTOS) {
    const livre = e.livreMinutos ? ` Tem ${duracao(e.livreMinutos)} livres até lá.` : "";
    return `Nada marcado agora. Às ${hora(e.proximo.inicio)}: «${e.proximo.titulo}» (daqui a ${duracao(
      e.emMinutos ?? 0,
    )}).${livre}`;
  }

  return null;
}

/**
 * ── O que ficou por fazer ─────────────────────────────────────────────────────
 *
 * A cobrança tem teto: ela não persegue ninguém até à exaustão. Mas o que ficou por fazer não
 * desaparece — vira memória dela. O Ethan escolheu assim, e escolheu bem:
 *
 *   «faz três dias que o duolingo passa batido. tá tudo bem?»
 *
 * O peso é relacional, não financeiro. Cobrar dinheiro por um dia mau é crueldade com juros.
 * Reparar que alguém sumiu é o que faz uma pessoa que se importa.
 *
 * E a distinção que sustenta tudo isto: «hoje não» NÃO é falha. É ele a falar com ela. Só o
 * SILÊNCIO conta como sumiço — e é por isso que o registo guarda os dois separados.
 */
export type RegistoDia = { blocoId: string; dia: string; estado: "feito" | "hoje_nao" | "ignorado" };

/** Quantos dias seguidos ele ignorou este bloco (sem responder nada). */
export function diasIgnorados(registos: RegistoDia[], blocoId: string, hoje: Date): number {
  const doBloco = new Map(registos.filter((r) => r.blocoId === blocoId).map((r) => [r.dia, r.estado]));

  let dias = 0;
  for (let i = 1; i <= 14; i++) {
    const d = new Date(hoje);
    d.setDate(d.getDate() - i);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;

    const estado = doBloco.get(chave);

    // Sem registo nenhum = ele ignorou (ninguém tocou em nada). É exatamente isto que ela
    // repara — o silêncio, não a recusa.
    if (estado === "feito" || estado === "hoje_nao") break;
    dias++;
  }

  return dias;
}

/** O bloco de memória: o que ele anda a deixar passar. `null` = nada a dizer. */
export function blocoSumico(
  blocos: BlocoRotinaCore[],
  registos: RegistoDia[],
  hoje: Date,
): string | null {
  const sumidos = blocos
    .map((b) => ({ bloco: b, dias: diasIgnorados(registos, b.id, hoje) }))
    // Um dia não é um sumiço — é um dia. Dois já é um padrão, e é aí que uma amiga repara.
    .filter((x) => x.dias >= 2)
    .sort((a, b) => b.dias - a.dias)
    .slice(0, 2);

  if (!sumidos.length) return null;

  return sumidos
    .map((x) => `«${x.bloco.titulo}» passa batido há ${x.dias} dias (ele não respondeu nada).`)
    .join("\n");
}

/** Kill-switch: `LUNA_NEURONIO_ROTINA=0`. */
export function neuronioRotinaAtivo(): boolean {
  const raw = process.env.LUNA_NEURONIO_ROTINA?.trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off");
}

/**
 * O dia e o minuto DELE — no fuso do telemóvel dele, não no do servidor.
 *
 * Sem isto, um servidor em UTC diria que ele está a dormir às 5h da manhã quando são 8h em
 * São Paulo — e ela comentaria a rotina errada com toda a segurança do mundo. O `timeZone`
 * já chega ao pipeline (veio do grounding temporal); é só usá-lo.
 */
export function agoraNoFusoDele(timeZone?: string): { dia: number; minuto: number } {
  const agora = new Date();

  if (!timeZone) {
    return { dia: agora.getDay(), minuto: agora.getHours() * 60 + agora.getMinutes() };
  }

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const partes = Object.fromEntries(fmt.formatToParts(agora).map((p) => [p.type, p.value]));
  const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    dia: DIAS[partes.weekday ?? "Sun"] ?? agora.getDay(),
    minuto: Number(partes.hour ?? 0) * 60 + Number(partes.minute ?? 0),
  };
}
