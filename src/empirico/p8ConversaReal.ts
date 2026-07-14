import "../carregarEnv.js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { type ConfigLuna } from "../providers/tipos.js";
import { executarPipelineCompleto } from "../pipeline/executarPipelineCompleto.js";

/**
 * P8 — A conversa REAL. (E porque a P4 não valia nada.)
 *
 * ── O erro que esta bateria existe para corrigir ──────────────────────────────
 * A P4 media uma conversa que eu inventei: 8 turnos, mundo vazio, sessão nova. Deu 46
 * palavras de média e eu passei o dia a afinar uma parede contra esse número.
 *
 * Depois medi as conversas REAIS do Ethan, exportadas do Orbit:
 *
 *   conversa          turnos   ele    ELA    razão   respostas ≥120 palavras
 *   13/07 (hoje)        32      17    162    9,7×    62%
 *   12/07               62      16    162   10,1×    84%
 *   12/07 (longa)       81      17    157    9,3×    78%
 *
 * Ele escreve 17 palavras. Ela devolve 160. O máximo observado foi 466.
 *
 * A minha sonda dava 46. Eu não estava a medir a Luna de que ele se queixa — estava a
 * medir uma Luna de laboratório, saudável, que nunca teve a doença. **Todas as conclusões
 * da P4 sobre tamanho são nulas.**
 *
 * ── O instrumento certo ───────────────────────────────────────────────────────
 * Parar de inventar diálogo. Esta bateria pega no ficheiro exportado do Orbit, extrai as
 * mensagens que o Ethan escreveu de facto, e reproduz a conversa inteira pelo pipeline —
 * na mesma sessão, na mesma ordem. O histórico acumula como acumulou na vida dele.
 *
 * Se o baseline aqui não chegar perto das ~160 palavras, então a causa do inchaço não é a
 * acumulação de histórico e sim algo que só existe em produção (mundo interior povoado,
 * recall entre conversas, interlocutor verificado) — e isso é um resultado tão útil quanto
 * o outro. O que não se pode é continuar a afinar contra um número que não é o do doente.
 *
 * Uso:
 *   npx tsx src/empirico/p8ConversaReal.ts
 *   P8_EXPORT=/caminho/para/conversa.md P8_TURNOS=20 npx tsx ...
 */

const B = "\x1b[1m", C = "\x1b[90m", A = "\x1b[33m", V = "\x1b[32m", R = "\x1b[31m", X = "\x1b[0m";

const MODELO_MENOR = process.env.P8_MENOR?.trim() || "deepseek/deepseek-v4-flash";
const MODELO_MAIOR = process.env.P8_MAIOR?.trim() || "deepseek/deepseek-v4-pro";

const EXPORT_PADRAO =
  "C:/Users/ethan/Documents/Bluetooth/mas-o-que-mais-eu-tenho-pra-falar-sobre-isso.md";

/** As palavras dele e as dela, na conversa que aconteceu de verdade. */
type TurnoReal = { ethan: string; lunaPalavras: number };

/**
 * Extrai a conversa do markdown exportado pelo Orbit.
 * Formato:  **Você:**\n\n<msg>\n\n**Luna:**\n\n<resposta>
 */
function lerExport(caminho: string): TurnoReal[] {
  const bruto = readFileSync(caminho, "utf8");
  const partes = bruto.split(/\n\*\*(Você|Luna):\*\*\n/);

  const turnos: TurnoReal[] = [];
  let pendente: string | null = null;

  for (let i = 1; i < partes.length - 1; i += 2) {
    const quem = partes[i];
    const texto = partes[i + 1].trim();

    if (quem === "Você") {
      pendente = texto;
    } else if (pendente !== null) {
      turnos.push({ ethan: pendente, lunaPalavras: palavras(texto) });
      pendente = null;
    }
  }

  return turnos;
}

const palavras = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/**
 * A VOZ. Esta é a métrica que pode reprovar tudo o resto.
 *
 * Um editor de temperatura baixa a «arrumar» o texto devolve prosa média, segura e morta. Se
 * a linha de revisão encolher a Luna e lhe levar o riso junto, ela é reprovada — por muito
 * bonitos que fiquem os números do tamanho.
 */
const MARCAS_DA_VOZ = /(kkk+|haha|kk|né|pô|cara|eita|caraca|olha só|tipo|mano|😅|🤍|kkkk)/gi;
const voz = (t: string) => (t.match(MARCAS_DA_VOZ) ?? []).length;
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const mediana = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

type Braco = { rotulo: string; registro: boolean; diretiva: boolean; cor: string };

const BRACOS: Braco[] = [
  { rotulo: "HOJE", registro: false, diretiva: false, cor: A },
  { rotulo: "LINHA", registro: true, diretiva: false, cor: V },
];

function configCom(braco: Braco): ConfigLuna {
  process.env.LUNA_REGISTRO_CONVERSA = "1"; // o alvo é sempre computado — é ele que o editor usa
  process.env.LUNA_REGISTRO_DIRETIVA = "0"; // zero prompt: a diretiva morreu
  // O braço é a LINHA DE REVISÃO: detetor + reescritor, a correr depois de ela falar.
  process.env.LUNA_LINHA_REVISAO = braco.registro ? "1" : "0";

  const orKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!orKey) throw new Error("P8 precisa de OPENROUTER_API_KEY.");

  // Igual à produção: o gate de peso manda o papo para o modelo pequeno e a análise para o
  // grande. A P4 punha flash nos dois — mais um sítio onde eu media outra Luna.
  return {
    apiKey: orKey,
    baseUrl: "https://openrouter.ai/api/v1",
    modeloMenor: MODELO_MENOR,
    modeloMaior: MODELO_MAIOR,
    temperaturaMenor: 0,
    temperaturaMaior: Number(process.env.OPENROUTER_TEMPERATURA ?? 1),
  };
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function responder(mensagem: string, braco: Braco, sessaoId: string): Promise<string> {
  for (let t = 1; t <= 3; t++) {
    try {
      const r = await executarPipelineCompleto(mensagem, {
        sessaoId,
        ambiente: "orbit_mobile",
        config: configCom(braco),
        timeZone: "America/Sao_Paulo",
        // Em produção ele é o criador verificado. É mais uma peça que a P4 não tinha.
        interlocutor: { uid: "ethan-teste", criador_verificado: true },
      });
      return r.resposta?.texto ?? "";
    } catch {
      console.log(`${C}  … rede falhou (${t}/3)${X}`);
      await dormir(5_000 * t);
    }
  }
  return "";
}

async function main(): Promise<void> {
  const caminho = process.env.P8_EXPORT?.trim() || EXPORT_PADRAO;
  const limite = Number(process.env.P8_TURNOS ?? 0);

  let conversa = lerExport(caminho);
  if (limite > 0) conversa = conversa.slice(0, limite);

  const realDela = conversa.map((t) => t.lunaPalavras);
  const realDele = conversa.map((t) => palavras(t.ethan));

  console.log(`${B}╔═══ P8 · A conversa REAL do Ethan, reproduzida ═══╗${X}`);
  console.log(`${C}${caminho.split(/[/\\]/).pop()}${X}`);
  console.log(`${C}${conversa.length} turnos · ele ${media(realDele).toFixed(0)} palavras · ela ${media(realDela).toFixed(0)} (no Orbit, de verdade)${X}\n`);

  const resultados = new Map<string, number[]>();
  const vozes = new Map<string, number[]>();

  for (const braco of BRACOS) {
    console.log(`${B}${"═".repeat(70)}${X}`);
    console.log(`${braco.cor}${B}▶ ${braco.rotulo}${X} ${C}(teto ${braco.registro ? "ON" : "off"})${X}\n`);

    const sessao = randomUUID();
    const palavrasDela: number[] = [];
    const vozDela: number[] = [];

    for (const [i, turno] of conversa.entries()) {
      const texto = await responder(turno.ethan, braco, sessao);
      if (!texto) continue;

      const p = palavras(texto);
      palavrasDela.push(p);
      vozDela.push(voz(texto));

      // A comparação que interessa: o que ela disse NO ORBIT vs o que diz agora.
      const delta = p - turno.lunaPalavras;
      const seta = delta < -20 ? `${V}▼${Math.abs(delta)}${X}` : delta > 20 ? `${R}▲${delta}${X}` : `${C}≈${X}`;

      console.log(
        `${C}${String(i + 1).padStart(2)}.${X} ${A}${palavras(turno.ethan)}p${X} → ` +
          `${B}${String(p).padStart(3)}p${X} ${C}(no Orbit foram ${turno.lunaPalavras})${X} ${seta}`,
      );
    }

    resultados.set(braco.rotulo, palavrasDela);
    vozes.set(braco.rotulo, vozDela);
    console.log();
  }

  console.log(`${B}${"═".repeat(70)}${X}`);
  console.log(`${B}RESULTADO — palavras dela por turno${X}\n`);

  const linha = (nome: string, xs: number[], cor = X) =>
    console.log(
      `${cor}${nome.padEnd(22)}${X} média ${B}${media(xs).toFixed(0).padStart(4)}${X}   ` +
        `mediana ${String(mediana(xs)).padStart(4)}   ` +
        `≥120 palavras: ${xs.filter((n) => n >= 120).length}/${xs.length}`,
    );

  linha("NO ORBIT (o doente)", realDela, R);
  for (const b of BRACOS) linha(b.rotulo, resultados.get(b.rotulo)!, b.cor);

  console.log(`
${B}A VOZ — marcas de gíria/riso por resposta (se isto cair, reprovou):${X}`);
  for (const b of BRACOS) {
    const v = vozes.get(b.rotulo)!;
    console.log(`${b.cor}${b.rotulo.padEnd(22)}${X} ${media(v).toFixed(1)} marcas/resposta`);
  }

  const vozHoje = media(vozes.get("HOJE")!);
  const vozLinha = media(vozes.get("LINHA")!);
  if (vozLinha < vozHoje * 0.7) {
    console.log(`
${R}${B}✗ REPROVADO: a linha de revisão levou-lhe a voz junto com o excesso.${X}`);
  } else {
    console.log(`
${V}${B}✓ a voz aguentou o corte.${X}`);
  }

  console.log();

  const hoje = media(resultados.get("HOJE")!);
  const real = media(realDela);
  const desvio = Math.abs(hoje - real) / real;

  if (desvio > 0.35) {
    console.log(
      `${R}${B}⚠ A SONDA NÃO REPRODUZ A DOENÇA.${X}\n` +
        `${C}  No Orbit ela escreve ${real.toFixed(0)} palavras; aqui, sem tocar em nada, ${hoje.toFixed(0)}.\n` +
        `  A causa do inchaço não é a acumulação de histórico — está em algo que só existe\n` +
        `  em produção (mundo interior povoado, recall entre conversas, briefing cheio).\n` +
        `  Afinar a parede contra ${hoje.toFixed(0)} palavras é afinar contra um doente saudável.${X}\n`,
    );
  } else {
    console.log(`${V}${B}✓ a sonda reproduz o inchaço — agora dá para medir o remédio.${X}\n`);
  }
}

main().catch((e) => {
  console.error("Erro:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
