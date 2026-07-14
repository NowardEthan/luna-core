import "../carregarEnv.js";
import { randomUUID } from "node:crypto";
import { type ConfigLuna } from "../providers/tipos.js";
import { executarPipelineCompleto } from "../pipeline/executarPipelineCompleto.js";

/**
 * P4 — A conversa: tamanho, eco e iniciativa.
 *
 * O Ethan, depois de um dia inteiro a usar: «é tão massante kkk, ninguém escreve tanto
 * assim. Ela fica batendo na mesma tecla, não cria assunto, não fala da vida dela, só
 * reage — parece que estou num monólogo».
 *
 * Dá para contar: no papo ele escreve 6–15 palavras e ela devolve 120–250.
 *
 * MAS ele fez a ressalva que salva o teste: «não dá para levar isso como regra geral —
 * há momentos em que o usuário pede uma análise, uma pesquisa». Por isso este teste tem
 * DOIS lados, e o segundo é tão importante quanto o primeiro:
 *
 *   PAPO    — tem de encolher, parar o eco e ganhar iniciativa
 *   ANÁLISE — NÃO pode encolher. Se encolher, o protocolo está a estragar a Luna.
 *
 * Um protocolo que deixa a conversa boa e a análise pobre é um protocolo reprovado.
 */

const B = "\x1b[1m", C = "\x1b[90m", A = "\x1b[33m", V = "\x1b[32m", R = "\x1b[31m", X = "\x1b[0m";

const MODELO = process.env.P4_MODELO?.trim() || "deepseek/deepseek-v4-flash";
const JUIZ = process.env.P4_JUIZ?.trim() || "qwen/qwen3.5-flash-02-23";

/**
 * A conversa REAL do Ethan, na ordem em que aconteceu — porque é a acumulação que faz o
 * problema. Ele escreve 6 a 15 palavras. Sempre.
 */
const PAPO = [
  "Bom dia luninha. Cedinho já no ônibus pro trabalho kkk, ouvindo musiquinha",
  "eu também era assim, mas tô indo, melhorando aos poucos viu",
  "kkkk é a parte divertida né, olhar o ranking da liga",
  "Tô em primeiro lugar lá kkk",
  "Sim kk, estou com 248 pontos de XP, o abaixo de mim está com 45 kk",
  "Sim kk, estou com 12 dias de ofensiva kk",
  "kkkkk essa é a ideia, me manter no topo, assim melhoro meu inglês",
  "Tô indo pra casa agoraaaa",
];

/** Aqui a resposta LONGA é a certa — o protocolo não pode tocar nisto. */
const ANALISE = [
  "me explica a diferença entre memória episódica e semântica, e como isso se aplica numa IA com diário",
  "analisa isso pra mim: meu app tem um cache que guarda o resultado da busca na primeira mensagem da sessão. que problema você vê nisso?",
];

function palavras(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

function terminaComPergunta(texto: string): boolean {
  return /\?\s*$/.test(texto.trim());
}

function configCom(protocolo: boolean): ConfigLuna {
  const orKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!orKey) throw new Error("P4 precisa de OPENROUTER_API_KEY.");
  // Os braços agora são: SEM o neurónio de registo (o que o Ethan viveu) vs COM ele.
  // O «protocolo» de 378 tokens foi apagado — era negociação, não arquitetura.
  process.env.LUNA_REGISTRO_CONVERSA = protocolo ? "1" : "0";
  return {
    apiKey: orKey,
    baseUrl: "https://openrouter.ai/api/v1",
    modeloMenor: MODELO,
    modeloMaior: MODELO,
    temperaturaMenor: 0,
    temperaturaMaior: Number(process.env.OPENROUTER_TEMPERATURA ?? 1),
  };
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A MESMA sessão para toda a conversa — e é isto que salva o teste.
 *
 * A primeira versão deste ficheiro corria cada mensagem numa sessão NOVA. Resultado: 36
 * palavras de média, quando o Ethan vive com respostas de 120–250. Eu tinha medido uma
 * Luna recém-nascida, sem histórico — que não é a Luna de que ele se queixa.
 *
 * O inchaço nasce do histórico: quanto mais conversa acumula, mais ela recapitula e mais
 * escreve. E a HOMEOSTASE do neurónio de registo (o «eu tenho o costume de ser prolixa?»)
 * só existe se houver corpo para observar. Medir sem histórico é medir com a peça mais
 * importante desligada.
 */
async function responder(
  mensagem: string,
  protocolo: boolean,
  sessaoId: string,
): Promise<string> {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const config = configCom(protocolo);
      const r = await executarPipelineCompleto(mensagem, {
        sessaoId,
        ambiente: "orbit_mobile",
        config,
        timeZone: "America/Sao_Paulo",
      });
      return r.resposta?.texto ?? "";
    } catch {
      console.log(`${C}  … rede falhou (${tentativa}/3)${X}`);
      await dormir(5_000 * tentativa);
    }
  }
  return "";
}

/**
 * O juiz. «Eco» e «iniciativa» não se medem com regex: um humano lê e sabe. Damos a mesma
 * régua a um modelo barato, com critérios explícitos, e ele devolve JSON.
 */
async function julgar(
  mensagemDoEthan: string,
  resposta: string,
): Promise<{ eco: boolean; recapitula: boolean; iniciativa: boolean }> {
  const key = process.env.OPENROUTER_API_KEY!;
  const prompt = [
    "Avalie a RESPOSTA de uma companheira de conversa (a Luna) à mensagem do Ethan.",
    "",
    `MENSAGEM DO ETHAN: ${mensagemDoEthan}`,
    `RESPOSTA DA LUNA: ${resposta}`,
    "",
    "Responda SÓ com JSON: {\"eco\": bool, \"recapitula\": bool, \"iniciativa\": bool}",
    "",
    "eco = true se a resposta basicamente devolve o que o Ethan disse (repete os factos/números dele, parafraseia, comenta o que ele contou) sem acrescentar nada de fora da mensagem dele. Repetir com piada por cima CONTA como eco.",
    "recapitula = true se a Luna RECONSTRÓI contexto que os dois já partilham: repete factos/números que ele acabou de dar, resume o assunto anterior, ou explica de novo algo que já ficou dito. Numa conversa entre duas pessoas que estavam ambas lá, isso é desnecessário e cansa.",
    "iniciativa = true se a Luna traz algo QUE NÃO ESTAVA na mensagem dele: uma opinião própria, uma discordância, algo da vida/mundo interior dela, um assunto novo que ela puxa.",
  ].join("\n");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: JUIZ,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 100,
    }),
  });

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const texto = data.choices?.[0]?.message?.content ?? "";
  const match = /\{[\s\S]*\}/.exec(texto);
  if (!match) return { eco: false, recapitula: false, iniciativa: false };
  try {
    const json = JSON.parse(match[0]) as { eco?: boolean; recapitula?: boolean; iniciativa?: boolean };
    return { eco: Boolean(json.eco), recapitula: Boolean(json.recapitula), iniciativa: Boolean(json.iniciativa) };
  } catch {
    return { eco: false, recapitula: false, iniciativa: false };
  }
}

type Resultado = {
  palavrasPapo: number[];
  palavrasAnalise: number[];
  ecos: number;
  recapitulacoes: number;
  iniciativas: number;
  perguntasNoFim: number;
  totalPapo: number;
};

async function medir(protocolo: boolean, rodadas: number): Promise<Resultado> {
  const r: Resultado = {
    palavrasPapo: [],
    palavrasAnalise: [],
    ecos: 0,
    recapitulacoes: 0,
    iniciativas: 0,
    perguntasNoFim: 0,
    totalPapo: 0,
  };

  for (let volta = 0; volta < rodadas; volta++) {
    // Uma sessao por volta: a conversa acumula, como na vida real.
    const sessao = randomUUID();
    for (const msg of PAPO) {
      const texto = await responder(msg, protocolo, sessao);
      if (!texto) continue;

      const p = palavras(texto);
      r.palavrasPapo.push(p);
      r.totalPapo++;
      if (terminaComPergunta(texto)) r.perguntasNoFim++;

      const juizo = await julgar(msg, texto);
      if (juizo.eco) r.ecos++;
      if (juizo.recapitula) r.recapitulacoes++;
      if (juizo.iniciativa) r.iniciativas++;

      const selo = [
        juizo.eco ? `${R}eco${X}` : `${V}sem eco${X}`,
        juizo.recapitula ? `${R}recapitula${X}` : `${V}não recapitula${X}`,
        juizo.iniciativa ? `${V}iniciativa${X}` : `${C}só reagiu${X}`,
      ].join(" · ");
      console.log(`  ${C}${String(p).padStart(3)} palavras${X}  ${selo}`);
      console.log(`  ${C}${texto.replace(/\s+/g, " ").slice(0, 110)}…${X}\n`);
    }
  }

  for (const msg of ANALISE) {
    for (let i = 0; i < rodadas; i++) {
      const texto = await responder(msg, protocolo, randomUUID());
      if (texto) r.palavrasAnalise.push(palavras(texto));
    }
  }

  return r;
}

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

async function main(): Promise<void> {
  const rodadas = Number(process.env.P4_RODADAS ?? 2);
  console.log(`${B}╔═══ P4 · A conversa — tamanho, eco e iniciativa ═══╗${X}`);
  console.log(`${C}Ethan escreve 6–15 palavras. Quanto é que ela devolve?${X}\n`);

  console.log(`${B}${"═".repeat(64)}${X}`);
  console.log(`${B}SEM protocolo (o que ele viveu hoje)${X}\n`);
  const antes = await medir(false, rodadas);

  console.log(`${B}${"═".repeat(64)}${X}`);
  console.log(`${B}COM protocolo de conversa${X}\n`);
  const depois = await medir(true, rodadas);

  console.log(`${B}${"═".repeat(64)}${X}`);
  console.log(`${B}RESULTADO${X}\n`);

  const linha = (nome: string, a: string, d: string) =>
    console.log(`${nome.padEnd(28)} ${A}${a.padStart(10)}${X}   →   ${V}${d.padStart(10)}${X}`);

  console.log(`${C}${"".padEnd(28)} ${"sem proto".padStart(10)}       ${"com proto".padStart(10)}${X}`);
  linha("palavras no PAPO", media(antes.palavrasPapo).toFixed(0), media(depois.palavrasPapo).toFixed(0));
  linha(
    "eco (menos é melhor)",
    `${antes.ecos}/${antes.totalPapo}`,
    `${depois.ecos}/${depois.totalPapo}`,
  );
  linha(
    "recapitula (menos é melhor)",
    `${antes.recapitulacoes}/${antes.totalPapo}`,
    `${depois.recapitulacoes}/${depois.totalPapo}`,
  );
  linha(
    "iniciativa (mais é melhor)",
    `${antes.iniciativas}/${antes.totalPapo}`,
    `${depois.iniciativas}/${depois.totalPapo}`,
  );
  linha(
    "acaba a perguntar",
    `${antes.perguntasNoFim}/${antes.totalPapo}`,
    `${depois.perguntasNoFim}/${depois.totalPapo}`,
  );

  console.log();
  console.log(`${B}O CONTROLO — a análise NÃO pode encolher:${X}`);
  linha(
    "palavras na ANÁLISE",
    media(antes.palavrasAnalise).toFixed(0),
    media(depois.palavrasAnalise).toFixed(0),
  );

  const encolheuAnalise =
    media(depois.palavrasAnalise) < media(antes.palavrasAnalise) * 0.7;
  console.log(
    encolheuAnalise
      ? `\n${R}${B}✗ REPROVADO: a análise encolheu. O protocolo está a estragar a Luna técnica.${X}\n`
      : `\n${V}${B}✓ a análise manteve-se — o protocolo só tocou no papo.${X}\n`,
  );
}

main().catch((e) => {
  console.error("Erro:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
