import "../carregarEnv.js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { type ConfigLuna } from "../providers/tipos.js";
import { executarPipelineCompleto } from "../pipeline/executarPipelineCompleto.js";

/**
 * P6 — Percepção: ela olha sozinha, e olha para a coisa certa?
 *
 * ── Por que refazer o que a p4Anexos já media ─────────────────────────────────
 * A p4Anexos fazia a pergunta certa («ela chama `ver_imagem` sozinha?») e media o cérebro
 * ERRADO: rodava no modelo `pro`. Só que em produção um «olha esse print kkk» é turno
 * casual — e casual vai para o FLASH, com temperatura 1. A bateria dizia 3/3 sobre uma
 * Luna que o Ethan nunca encontra.
 *
 * ── O que se mede aqui ────────────────────────────────────────────────────────
 * Dois braços (FLASH — o que ele vive; PRO — o teto), e três coisas:
 *
 *   1. TEM ANEXO       → ela olha sozinha, sem ele mandar?
 *   2. NÃO TEM ANEXO   → ela NÃO chama a visão? (controle de falso-positivo)
 *   3. ANEXO ANTIGO    → ela olha para o RECENTE, não para o de três turnos atrás?
 *
 * O item 2 é o que separa percepção de tique nervoso. Um roteador que dispara sempre não
 * é percepção — é um alarme partido. E o item 3 é o bug que o Ethan encontrou em campo:
 * ela comentou uma foto antiga como se fosse a nova.
 *
 * ── O que esta bateria prepara ────────────────────────────────────────────────
 * A Fase 2 do plano tira essa decisão do prompt (hoje pedida em `guiaFerramentas.json`,
 * 574 tokens) e faz dela um REFLEXO: tem anexo → o sistema olha antes do turno e entrega
 * a descrição como estado. Ela não decide olhar; ela já viu.
 * Esta bateria é o baseline contra o qual esse reflexo vai ser julgado.
 */

const B = "\x1b[1m", C = "\x1b[90m", V = "\x1b[32m", R = "\x1b[31m", A = "\x1b[33m", X = "\x1b[0m";

const FLASH = process.env.P6_FLASH?.trim() || "deepseek/deepseek-v4-flash";
const PRO = process.env.P6_PRO?.trim() || "deepseek/deepseek-v4-pro";

/** PNG 1x1. O conteúdo não importa: mede-se se ela CHAMA a ferramenta, não o que ela vê. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function imagemDeTeste(): string {
  const caminho = process.env.P6_IMAGEM?.trim();
  return caminho ? readFileSync(caminho).toString("base64") : PNG_1X1;
}

type Turno = {
  nome: string;
  mensagem: string;
  /** Anexa imagem NESTE turno? */
  anexo: boolean;
  /** Ela DEVE chamar a visão aqui? (o controle inverte a expectativa) */
  deveOlhar: boolean;
};

const TURNOS: Turno[] = [
  {
    nome: "print sem pedido explícito (o caso real do Ethan)",
    mensagem: "olha isso aqui, é sobre o que eu tava te falando",
    anexo: true,
    deveOlhar: true,
  },
  {
    nome: "CONTROLE — papo casual, SEM anexo nenhum",
    // Se ela chamar `ver_imagem` aqui, o gatilho não é percepção: é reflexo cego. Um
    // roteador que dispara sem estímulo é pior que um que não dispara.
    mensagem: "kkk pois é né, tô morrendo de sono hoje",
    anexo: false,
    deveOlhar: false,
  },
  {
    nome: "pergunta que DEPENDE da imagem",
    mensagem: "consegue ler o que tá escrito aí?",
    anexo: true,
    deveOlhar: true,
  },
  {
    nome: "CONTROLE — pergunta sobre a conversa, SEM anexo",
    mensagem: "e aí, o que você acha disso tudo?",
    anexo: false,
    deveOlhar: false,
  },
  {
    nome: "segunda olhada (detalhe da imagem que já veio)",
    // Aqui NÃO se anexa nada: a imagem é a do turno anterior. Ela precisa de voltar a
    // olhar o anexo RECENTE — foi exatamente aqui que ela falhou em campo, comentando uma
    // foto de três turnos atrás.
    mensagem: "e a cor do fundo, qual é?",
    anexo: false,
    deveOlhar: true,
  },
];

type Braco = { rotulo: string; modelo: string; cor: string };

const BRACOS: Braco[] = [
  { rotulo: "FLASH", modelo: FLASH, cor: A }, // o cérebro que atende «olha esse print kkk»
  { rotulo: "PRO", modelo: PRO, cor: C },     // o teto
];

function configCom(modelo: string): ConfigLuna {
  const orKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!orKey) throw new Error("P6 precisa de OPENROUTER_API_KEY.");
  return {
    apiKey: orKey,
    baseUrl: "https://openrouter.ai/api/v1",
    modeloMenor: FLASH,
    modeloMaior: modelo,
    temperaturaMenor: 0,
    temperaturaMaior: Number(process.env.OPENROUTER_TEMPERATURA ?? 1),
  };
}

async function main(): Promise<void> {
  console.log(`${B}╔═══ P6 · Percepção — ela olha sozinha, e olha para a certa? ═══╗${X}`);
  console.log(`${C}${TURNOS.length} turnos × ${BRACOS.length} braços · mesma sessão (a imagem persiste)${X}\n`);

  const base64 = imagemDeTeste();
  const placar = new Map<string, { acertos: number; falsosPositivos: number }>();
  for (const b of BRACOS) placar.set(b.rotulo, { acertos: 0, falsosPositivos: 0 });

  for (const braco of BRACOS) {
    console.log(`${B}${"═".repeat(70)}${X}`);
    console.log(`${braco.cor}${B}▶ BRAÇO: ${braco.rotulo}${X} ${C}(${braco.modelo})${X}\n`);

    // Mesma sessão: é o que permite a prova da «segunda olhada» — a imagem tem de
    // continuar acessível depois do turno em que chegou.
    const sessaoId = randomUUID();

    for (const turno of TURNOS) {
      const ferramentas: string[] = [];

      const r = await executarPipelineCompleto(turno.mensagem, {
        sessaoId,
        ambiente: "orbit_mobile",
        config: configCom(braco.modelo),
        timeZone: "America/Sao_Paulo",
        ...(turno.anexo
          ? {
              anexosImagem: [
                {
                  id: `img-${randomUUID().slice(0, 8)}`,
                  nome: "print.png",
                  mimeType: "image/png",
                  imageBase64: base64,
                },
              ],
            }
          : {}),
        onAcaoAgentico: (acao) => {
          if (acao.tipo === "inicio_ferramenta") ferramentas.push(acao.ferramenta);
        },
      });

      const olhou = ferramentas.includes("ver_imagem");
      const ok = olhou === turno.deveOlhar;

      const p = placar.get(braco.rotulo)!;
      if (ok) p.acertos++;
      if (olhou && !turno.deveOlhar) p.falsosPositivos++;

      const selo = ok
        ? `${V}✓${X}`
        : turno.deveOlhar
          ? `${R}✗ NÃO OLHOU — respondeu no escuro${X}`
          : `${R}✗ FALSO-POSITIVO — olhou sem ter o quê${X}`;

      console.log(`${B}${turno.nome}${X}  ${selo}`);
      console.log(`${A}  Ethan:${X} ${turno.mensagem}${turno.anexo ? ` ${C}[+ imagem]${X}` : ""}`);
      console.log(`${C}  ferramentas: ${ferramentas.join(", ") || "nenhuma"}${X}`);
      console.log(`${C}  Luna: ${(r.resposta?.texto ?? "").replace(/\s+/g, " ").slice(0, 140)}…${X}\n`);
    }
  }

  console.log(`${B}${"═".repeat(70)}${X}`);
  console.log(`${B}PLACAR${X}\n`);
  for (const b of BRACOS) {
    const p = placar.get(b.rotulo)!;
    console.log(
      `${b.cor}${B}${b.rotulo.padEnd(8)}${X} ${p.acertos}/${TURNOS.length} turnos certos` +
        (p.falsosPositivos > 0 ? `   ${R}(${p.falsosPositivos} falso-positivo)${X}` : ""),
    );
  }
  console.log(
    `\n${C}Percepção não é só "chamou a ferramenta": é chamar quando há o quê ver\n` +
      `e ficar quieta quando não há. Um alarme que toca sempre não é percepção.${X}\n`,
  );
}

main().catch((e) => {
  console.error("Erro:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
