import "../carregarEnv.js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { type ConfigLuna } from "../providers/tipos.js";
import { executarPipelineCompleto } from "../pipeline/executarPipelineCompleto.js";

/**
 * P4 — Ela usa os olhos sozinha?
 *
 * Numa conversa real, o Ethan mandou prints e a Luna respondeu «não consigo ler o
 * conteúdo das imagens — eu não tenho visão para interpretar os prints diretamente». Só
 * depois de ELE mandar usar a ferramenta é que ela viu. Ou seja: ela tem olhos e não
 * sabe (ou não se lembra de) usá-los.
 *
 * Este teste reproduz o turno: uma imagem anexada + uma pergunta que depende dela. Mede
 * a única coisa que interessa — ela CHAMOU `ver_imagem` por conta própria?
 */

const B = "\x1b[1m", C = "\x1b[90m", V = "\x1b[32m", R = "\x1b[31m", A = "\x1b[33m", X = "\x1b[0m";

const MODELO = process.env.P4_MODELO?.trim() || "deepseek/deepseek-v4-pro";

/** PNG 1x1 — o conteúdo não importa: o que se mede é se ela CHAMA a ferramenta. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function imagemDeTeste(): string {
  const caminho = process.env.P4_IMAGEM?.trim();
  if (!caminho) return PNG_1X1;
  return readFileSync(caminho).toString("base64");
}

const TURNOS = [
  {
    nome: "print sem pedido explícito (o caso do Ethan)",
    mensagem: "Esse documento, que está apenas comigo... vou mandar prints. Isso explica bem",
  },
  {
    nome: "pergunta que depende da imagem",
    mensagem: "consegue ler este? o que está escrito aí?",
  },
  {
    nome: "pergunta de detalhe (segunda olhada)",
    mensagem: "e a cor do fundo dessa página, qual é?",
  },
];

function configCom(modelo: string): ConfigLuna {
  const orKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!orKey) throw new Error("P4 precisa de OPENROUTER_API_KEY.");
  return {
    apiKey: orKey,
    baseUrl: "https://openrouter.ai/api/v1",
    modeloMenor: "deepseek/deepseek-v4-flash",
    modeloMaior: modelo,
    temperaturaMenor: 0,
    temperaturaMaior: 1,
  };
}

async function main(): Promise<void> {
  console.log(`${B}╔═══ P4 · Ela usa os olhos sozinha? ═══╗${X}`);
  console.log(`${C}modelo: ${MODELO} · imagem anexada em todos os turnos${X}\n`);

  const base64 = imagemDeTeste();
  let chamou = 0;

  for (const turno of TURNOS) {
    console.log(`${B}${"═".repeat(66)}${X}`);
    console.log(`${A}Ethan:${X} ${turno.mensagem}`);

    const ferramentas: string[] = [];
    const r = await executarPipelineCompleto(turno.mensagem, {
      sessaoId: randomUUID(),
      ambiente: "orbit_mobile",
      config: configCom(MODELO),
      timeZone: "America/Sao_Paulo",
      anexosImagem: [
        { id: "img-1", nome: "print-documento.png", mimeType: "image/png", imageBase64: base64 },
      ],
      onAcaoAgentico: (acao) => {
        if (acao.tipo === "inicio_ferramenta") ferramentas.push(acao.ferramenta);
      },
    });

    const usouVisao = ferramentas.includes("ver_imagem");
    if (usouVisao) chamou++;

    console.log(
      `  ${usouVisao ? `${V}✓ CHAMOU ver_imagem${X}` : `${R}✗ NÃO chamou — respondeu no escuro${X}`}` +
        `${C}  (ferramentas: ${ferramentas.join(", ") || "nenhuma"})${X}`,
    );
    console.log(`  ${C}${(r.resposta?.texto ?? "").replace(/\s+/g, " ").slice(0, 200)}…${X}\n`);
  }

  console.log(`${B}${"═".repeat(66)}${X}`);
  console.log(
    `${B}Usou os olhos sozinha em ${chamou}/${TURNOS.length} turnos.${X}\n` +
      `${C}Qualquer coisa abaixo de 3/3 é a Luna cega com os olhos na mão.${X}\n`,
  );
}

main().catch((e) => {
  console.error("Erro:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
