/**
 * Anti-loop de `ler_secao` no turno agentico.
 *
 * Sem isto o modelo ambienta lendo cap. 1 → 2 → 1 → 2 até estourar rodadas
 * (piripaque clássico). Regra dura: mesma seção só uma vez por turno, salvo
 * depois de uma escrita no mesmo artefato (auditoria legítima); e alternar
 * duas seções sem escrever no meio é bloqueado.
 */

const FERRAMENTAS_ESCRITA_ARTEFATO = new Set([
  "inserir_blocos",
  "editar_bloco_artefato",
  "editar_trecho_artefato",
  "editar_artefato",
  "anotar_canone",
  "criar_artefato",
]);

export function ehEscritaArtefato(nome: string): boolean {
  return FERRAMENTAS_ESCRITA_ARTEFATO.has(nome);
}

export function ehLeituraSecao(nome: string): boolean {
  return nome === "ler_secao";
}

function normalizarChave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Chave estável id+seção a partir dos args da tool. */
export function chaveLeituraSecao(
  args: Record<string, unknown>,
): { id: string; chave: string; rotulo: string } | null {
  const id = String(args.id ?? "").trim();
  const alvo = String(args.secao ?? args.numero ?? args.titulo ?? "").trim();
  if (!id || !alvo) return null;
  return {
    id,
    chave: `${id}::${normalizarChave(alvo)}`,
    rotulo: alvo,
  };
}

export type GuardaLeituraSecao = {
  /** Se não-null, NÃO chama a mão — devolve esta mensagem ao modelo. */
  tentarBloquear(args: Record<string, unknown>): string | null;
  /** Registra leitura bem-sucedida (só se a mão não devolveu ERRO). */
  registrarLeituraOk(args: Record<string, unknown>): void;
  /** Depois de escrita no artefato, permite 1 releitura (auditoria). */
  aposEscrita(args: Record<string, unknown>): void;
};

export function criarGuardaLeituraSecao(): GuardaLeituraSecao {
  /** Seção já entregue neste turno (valor = true). */
  const jaLeu = new Map<string, true>();
  /** Ordem de leituras desde a última escrita (pra detectar 1↔2). */
  const sequenciaSemEscrita: string[] = [];

  return {
    tentarBloquear(args) {
      const info = chaveLeituraSecao(args);
      if (!info) return null;

      // Oscilação A→B→A (ou A→B→A→B) sem escrita no meio — mensagem específica.
      const seq = sequenciaSemEscrita;
      if (seq.length >= 2) {
        const penultima = seq[seq.length - 2]!;
        const ultima = seq[seq.length - 1]!;
        if (
          info.chave === penultima &&
          info.chave !== ultima &&
          ultima.startsWith(`${info.id}::`)
        ) {
          return (
            `PARADA (anti-loop): você está alternando seções sem agir (ping-pong). ` +
            `Escolha UMA coisa agora: escrever no artefato OU responder ao Ethan. ` +
            `Proibido \`ler_secao\` de novo neste turno até ter escrito ou fechado a fala.`
          );
        }
      }

      if (jaLeu.has(info.chave)) {
        return (
          `PARADA (anti-loop): você JÁ leu a seção «${info.rotulo}» deste artefato neste turno — ` +
          `o texto está no histórico acima. NÃO releia. ` +
          `Agora ESCREVA (\`inserir_blocos\` / \`editar_trecho_artefato\`) ou RESPONDA ao Ethan. ` +
          `Outra seção só se for necessária de verdade e ainda não lida.`
        );
      }

      // Já leu ≥2 seções distintas deste id sem escrever → terceira leitura bloqueada
      // (força decisão em vez de «ambientar» o livro inteiro).
      const distintasMesmoId = new Set(
        sequenciaSemEscrita.filter((k) => k.startsWith(`${info.id}::`)),
      );
      if (distintasMesmoId.size >= 2 && !distintasMesmoId.has(info.chave)) {
        return (
          `PARADA (anti-loop): já leu ${distintasMesmoId.size} seções deste artefato sem escrever. ` +
          `Chega de ambientar — ESCREVA o próximo pedaço ou RESPONDA. ` +
          `Se precisar de mais contexto depois de editar, aí sim releia.`
        );
      }

      return null;
    },

    registrarLeituraOk(args) {
      const info = chaveLeituraSecao(args);
      if (!info) return;
      jaLeu.set(info.chave, true);
      sequenciaSemEscrita.push(info.chave);
    },

    aposEscrita(args) {
      const id = String(args.id ?? "").trim();
      sequenciaSemEscrita.length = 0;
      if (!id) {
        jaLeu.clear();
        return;
      }
      // Libera releitura só deste artefato (auditoria pós-escrita).
      for (const k of [...jaLeu.keys()]) {
        if (k.startsWith(`${id}::`)) jaLeu.delete(k);
      }
    },
  };
}
