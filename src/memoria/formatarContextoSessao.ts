import type { ContextoSessao } from "./esquemaMemoria.js";
import type { Ambiente } from "../presenca/esquemaPresenca.js";

function formatarBlocoContextoAmbiente(
  ambiente: Ambiente | undefined,
  contextoAmbiente: string,
): string[] {
  if (ambiente === "forge") {
    return [
      "WORKSPACE DO LUNA FORGE (estado do IDE — editor, terminal, git):",
      "O bloco abaixo inclui modo do composer (Agente vs Chat), estado do workspace, ficheiros e terminal.",
      "Em modo Agente, ferramentas podem executar após a tua resposta; em modo Chat, limita-te a conversa/explicação.",
      "Respeita o modo indicado nos metadados — não peças scripts externos para ler ficheiros que já estão no contexto.",
      "",
      contextoAmbiente,
    ];
  }

  return [
    "CONTEXTO OPERACIONAL (Luna Runtime — superfície activa):",
    "Este bloco descreve onde estás agora (chat, CLI, etc.) e permissões. NÃO assumes IDE, ficheiros abertos nem Orbit/Forge salvo a superfície ser forge.",
    "Se o utilizador perguntar onde está, responde com base em PRESENÇA + este bloco — não inventes Forge nem código em curso.",
    "",
    contextoAmbiente,
  ];
}

function formatarBlocoSense(
  ambiente: Ambiente | undefined,
  contextoSense: string,
): string[] {
  if (ambiente === "forge") {
    return [
      "ACTIVIDADE DO COMPUTADOR (Luna Sense — em paralelo ao Forge):",
      "Descreve apps, media e foco no PC. NÃO confundir com ficheiros abertos, diff ou terminal do IDE.",
      "Se o utilizador perguntar o que está a fazer no PC, usa este bloco — não o workspace Forge.",
      "",
      contextoSense,
    ];
  }

  return [
    "ACTIVIDADE DO COMPUTADOR (Luna Sense):",
    "Sinais locais sobre o que o utilizador está a fazer no PC (app focada, media, timeline).",
    "«O que estou a fazer?» → secção Agora. «Últimos minutos/horas/o que fiz?» → secção Recente (timeline).",
    "Não inventes Forge, código nem apps que não apareçam abaixo.",
    "",
    contextoSense,
  ];
}

export function montarBlocoMemoria(contexto: ContextoSessao): string | null {
  const linhas: string[] = [];

  // V2.3 — presença: onde a Luna está agora (autoridade sobre localização).
  if (contexto.contexto_presenca?.trim()) {
    linhas.push(contexto.contexto_presenca.trim(), "");
  }

  if (contexto.contexto_ambiente?.trim()) {
    linhas.push(...formatarBlocoContextoAmbiente(contexto.ambiente_atual, contexto.contexto_ambiente.trim()));
  }

  if (contexto.contexto_sense?.trim()) {
    linhas.push("", ...formatarBlocoSense(contexto.ambiente_atual, contexto.contexto_sense.trim()));
  }

  if (contexto.historico.length > 0) {
    linhas.push(
      "SESSÃO ATIVA: o histórico desta conversa (mensagens user/assistant acima) foi fornecido pelo Luna Core.",
      "Use esse histórico para continuidade. NÃO diga que não lembra ou que cada conversa começa do zero — nesta sessão, o Core já entregou o contexto.",
    );
  }

  if (contexto.fatos.length > 0) {
    linhas.push("Fatos registrados nesta sessão:");
    for (const fato of contexto.fatos) {
      linhas.push(`- ${fato}`);
    }
  }

  const prefs = Object.entries(contexto.preferencias);
  if (prefs.length > 0) {
    linhas.push("Preferências do usuário nesta sessão:");
    for (const [chave, valor] of prefs) {
      linhas.push(`- ${chave}: ${valor}`);
    }
  }

  if (contexto.pendente_confirmacao) {
    linhas.push(
      `Aguardando confirmação do usuário para guardar: "${contexto.pendente_confirmacao.conteudo}"`,
    );
  }

  if (contexto.memorias_longas && contexto.memorias_longas.length > 0) {
    const cross = contexto.memorias_longas.filter((m) => m.startsWith("[Conversa "));
    const fatos = contexto.memorias_longas.filter((m) => !m.startsWith("[Conversa "));

    if (cross.length > 0) {
      linhas.push("\nOUTRAS CONVERSAS DO USUÁRIO (Orbit — recall entre sessões):");
      linhas.push(
        "O usuário pode referir-se a chats anteriores no Orbit. Os trechos abaixo são REAIS de outras sessões — use-os para responder.",
        "NÃO diga que não lembra se o trecho relevante estiver abaixo. Resuma ou cite o que foi discutido.",
      );
      for (const trecho of cross) {
        linhas.push(`\n${trecho}`);
      }
    }

    if (fatos.length > 0) {
      linhas.push("\nMemórias confirmadas relevantes (Longo Prazo):");
      for (const mem of fatos) {
        linhas.push(`- ${mem}`);
      }
    }

    linhas.push(`\nREGRAS DE USO DA MEMÓRIA LONGA:
1. Use as memórias apenas como contexto auxiliar e orientador.
2. Não mencione uma memória sensível (silenciosa/mencionar_se_perguntado) a menos que o usuário pergunte diretamente sobre o tema ou sobre a memória, ou se for estritamente necessário para responder.
3. NUNCA apresente memória como diagnóstico ou julgamento próprio. Sempre use frases como "você informou" ou "você confirmou".`);
  }

  if (linhas.length === 0) return null;

  return `CONTEXTO DE SESSÃO E MEMÓRIA (V1.8):

${linhas.join("\n")}`;
}
