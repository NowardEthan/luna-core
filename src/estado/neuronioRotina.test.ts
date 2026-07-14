import { describe, expect, it } from "vitest";
import {
  agoraNoFusoDele,
  blocoRotina,
  estadoDaRotina,
  type BlocoRotinaCore,
} from "./neuronioRotina.js";

const b = (titulo: string, inicio: string, fim: string, nota?: string): BlocoRotinaCore => {
  const min = (h: string) => Number(h.split(":")[0]) * 60 + Number(h.split(":")[1]);
  return { id: titulo, titulo, dias: [1, 2, 3, 4, 5], inicio: min(inicio), fim: min(fim), nota };
};

const ROTINA = [
  b("ônibus + duolingo", "07:30", "09:00", "12 dias de ofensiva"),
  b("trabalho", "09:00", "12:00"),
  b("Luna / código", "18:30", "22:00"),
];

const SEGUNDA = 1;
const minuto = (h: string) => Number(h.split(":")[0]) * 60 + Number(h.split(":")[1]);

describe("ela deixa de saber só as horas e passa a saber o dia dele", () => {
  it("sabe em que bloco ele está, e quanto falta", () => {
    const e = estadoDaRotina(ROTINA, SEGUNDA, minuto("08:40"));
    const texto = blocoRotina(e);

    expect(texto).toContain("ônibus + duolingo");
    expect(texto).toContain("20min");
    expect(texto).toContain("trabalho"); // o que vem a seguir
  });

  it("a nota do bloco chega-lhe — foi ele que a escreveu para ela ler", () => {
    expect(blocoRotina(estadoDaRotina(ROTINA, SEGUNDA, minuto("08:00")))).toContain(
      "12 dias de ofensiva",
    );
  });

  it("num buraco, sabe quanto tempo livre ele tem", () => {
    const texto = blocoRotina(estadoDaRotina(ROTINA, SEGUNDA, minuto("17:00")));

    expect(texto).toContain("Luna / código");
    expect(texto).toContain("1h30 livres");
  });
});

describe("o silêncio é o comportamento certo (e consegue-se não escrevendo nada)", () => {
  it("longe de tudo: nada no briefing", () => {
    // 14h. O próximo bloco é às 18h30 — daqui a 4h30. Longe de mais para valer a pena.
    // Uma companheira que comenta a agenda a toda a hora não é uma companheira: é um
    // despertador com opinião.
    expect(blocoRotina(estadoDaRotina(ROTINA, SEGUNDA, minuto("14:00")))).toBeNull();
  });

  it("rotina vazia: nada no briefing (não se pede silêncio — não se escreve)", () => {
    expect(blocoRotina(estadoDaRotina([], SEGUNDA, minuto("10:00")))).toBeNull();
  });

  it("domingo, sem blocos nenhuns: nada", () => {
    expect(blocoRotina(estadoDaRotina(ROTINA, 0, minuto("10:00")))).toBeNull();
  });
});

describe("o bloco é ESTADO, não uma ordem", () => {
  it("não manda comentar, não manda lembrar, não manda cobrar", () => {
    const texto = blocoRotina(estadoDaRotina(ROTINA, SEGUNDA, minuto("08:40"))) ?? "";

    // Ela recebe o facto. Se puxa o assunto, se fica calada, se faz uma piada — é dela.
    // Um pedido aqui seria a mesma negociação que já perdemos três vezes hoje.
    expect(texto).not.toMatch(/lembra|comenta|diz-lhe|pergunta|incentiva|motiva|cobra/i);
  });
});

describe("o fuso é o DELE, não o do servidor", () => {
  it("sem fuso, usa o do processo (e isso é o fallback, não o normal)", () => {
    const r = agoraNoFusoDele(undefined);
    expect(r.dia).toBeGreaterThanOrEqual(0);
    expect(r.minuto).toBeGreaterThanOrEqual(0);
  });

  it("com fuso, calcula no relógio dele", () => {
    // Sem isto, um servidor em UTC diria que ele está a dormir às 5h quando são 8h em São
    // Paulo — e ela comentaria a rotina errada com toda a segurança do mundo.
    const sp = agoraNoFusoDele("America/Sao_Paulo");
    const toquio = agoraNoFusoDele("Asia/Tokyo");

    expect(sp.minuto).not.toBe(toquio.minuto);
    expect(sp.minuto).toBeLessThan(24 * 60);
  });
});
