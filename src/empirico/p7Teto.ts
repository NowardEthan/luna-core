import "../carregarEnv.js";

/**
 * P7 — A parede é de papel?
 *
 * ── O erro que esta bateria existe para expor ─────────────────────────────────
 * O neurónio de registo calcula um teto (`max_tokens`) para o papo casual. Como o
 * `max_tokens` conta o RACIOCÍNIO junto com a resposta, eu somei-lhe uma reserva de 600
 * tokens para o pensamento não ser amordaçado.
 *
 * A conta que não fiz:
 *
 *   «bom dia»  →  alvo 18 palavras  →  teto 40 tokens  →  + reserva 600  =  640
 *   o que ela realmente gasta:  ~85 tokens de resposta + o que pensar
 *
 * Se ela pensa menos de ~555 tokens, o teto de 640 NUNCA encosta. A parede é decorativa —
 * e no braço «com neurónio» da P4 a única coisa que agia era a diretiva de 12 tokens no
 * briefing. Ou seja: eu tinha voltado ao prompt sem dar por isso, e o resultado piorou.
 *
 * ── O que se mede ─────────────────────────────────────────────────────────────
 * Quanto ela PENSA e quanto ela DIZ, em tokens medidos pelo provider (`usage`), num turno
 * casual real. Sem isso, qualquer reserva que eu escolher é chute — e um teto chutado é
 * um teto que não existe.
 */

const B = "\x1b[1m", C = "\x1b[90m", V = "\x1b[32m", R = "\x1b[31m", X = "\x1b[0m";

const MODELO = process.env.P7_MODELO?.trim() || "deepseek/deepseek-v4-flash";

const TURNOS = [
  "bom dia! tô no busão indo pro trampo, ouvindo música",
  "kkk pois é né, tô em primeiro lugar na liga do duolingo",
  "tô morrendo de sono hoje, dormi 4 horas",
  "acabei de lançar a 2.5.5 do orbit",
];

type Uso = {
  prompt_tokens?: number;
  completion_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
};

async function medir(mensagem: string, teto?: number): Promise<Uso & { texto: string }> {
  const key = process.env.OPENROUTER_API_KEY!;
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELO,
      messages: [
        {
          role: "system",
          content:
            "Você é a Luna. Fala como uma pessoa num chat: solta, com humor, sem parecer um comunicado.",
        },
        { role: "user", content: mensagem },
      ],
      temperature: 1,
      ...(teto ? { max_tokens: teto } : {}),
    }),
  });

  const j = (await r.json()) as {
    choices?: Array<{ message?: { content?: string; reasoning?: string } }>;
    usage?: Uso;
  };

  return {
    ...(j.usage ?? {}),
    texto: j.choices?.[0]?.message?.content ?? "",
  };
}

const palavras = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

async function main(): Promise<void> {
  console.log(`${B}╔═══ P7 · A parede é de papel? ═══╗${X}`);
  console.log(`${C}modelo: ${MODELO}${X}\n`);

  // ── Parte 1: quanto ela pensa e quanto ela diz, SEM teto nenhum ──────────────
  console.log(`${B}── SEM TETO — quanto ela gasta naturalmente ──${X}\n`);

  let somaRaciocinio = 0;
  let somaSaida = 0;

  for (const t of TURNOS) {
    const u = await medir(t);
    const raciocinio = u.completion_tokens_details?.reasoning_tokens ?? 0;
    const total = u.completion_tokens ?? 0;
    const dito = total - raciocinio;

    somaRaciocinio += raciocinio;
    somaSaida += dito;

    console.log(`${C}«${t}»${X}`);
    console.log(
      `  pensou ${B}${raciocinio}${X} tk · disse ${B}${dito}${X} tk (${palavras(u.texto)} palavras) · total ${total}\n`,
    );
  }

  const mediaRaciocinio = Math.round(somaRaciocinio / TURNOS.length);
  const mediaSaida = Math.round(somaSaida / TURNOS.length);

  console.log(`${B}${"═".repeat(60)}${X}`);
  console.log(`${B}MÉDIA${X}   pensa ${mediaRaciocinio} tk   ·   diz ${mediaSaida} tk\n`);

  // ── Parte 2: o teto que o neurónio estava a pôr, encostava? ─────────────────
  const alvoPalavras = 25; // típico de um turno casual do Ethan
  const tetoNeuronio = Math.round(alvoPalavras * 1.4 * 1.6);
  const RESERVA = 600;
  const tetoReal = tetoNeuronio + RESERVA;
  const gastoReal = mediaRaciocinio + mediaSaida;

  console.log(`${B}── O TETO DO NEURÓNIO ──${X}`);
  console.log(`${C}alvo ${alvoPalavras} palavras → teto ${tetoNeuronio} tk + reserva ${RESERVA} = ${B}${tetoReal}${X}${C} enviados como max_tokens${X}`);
  console.log(`${C}ela gasta, de facto: ${gastoReal} tk (${mediaRaciocinio} a pensar + ${mediaSaida} a dizer)${X}\n`);

  if (gastoReal < tetoReal) {
    console.log(
      `${R}${B}✗ A PAREDE NUNCA ENCOSTA.${X} ${R}Sobram ${tetoReal - gastoReal} tk de folga.${X}`,
    );
    console.log(
      `${C}  O teto é decorativo: no braço «com neurónio» da P4, quem agia era a diretiva\n` +
        `  de 12 tokens no briefing — ou seja, prompt outra vez.${X}\n`,
    );
  } else {
    console.log(`${V}${B}✓ a parede encosta.${X}\n`);
  }

  // ── Parte 3: um teto que REALMENTE encosta amordaça? ────────────────────────
  console.log(`${B}── E se o teto encostasse mesmo? ──${X}`);
  console.log(`${C}max_tokens = ${mediaRaciocinio + tetoNeuronio} (o que ela pensa + o alvo)${X}\n`);

  for (const t of TURNOS.slice(0, 2)) {
    const u = await medir(t, mediaRaciocinio + tetoNeuronio);
    const raciocinio = u.completion_tokens_details?.reasoning_tokens ?? 0;
    const dito = (u.completion_tokens ?? 0) - raciocinio;
    const vazio = u.texto.trim().length === 0;

    console.log(`${C}«${t}»${X}`);
    console.log(
      `  pensou ${raciocinio} · disse ${dito} tk (${palavras(u.texto)} palavras)` +
        (vazio ? `  ${R}✗ RESPOSTA VAZIA — a parede virou mordaça${X}` : `  ${V}✓${X}`),
    );
    console.log(`  ${C}${u.texto.replace(/\s+/g, " ").slice(0, 120)}…${X}\n`);
  }
}

main().catch((e) => {
  console.error("Erro:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
