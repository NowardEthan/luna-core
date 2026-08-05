/** Extrai texto de raciocínio de uma mensagem assistant (Groq, OpenRouter, Ollama, etc.). */
export function extrairRaciocinioDeMensagem(msg: unknown): string {
  if (!msg || typeof msg !== "object") return "";
  const m = msg as Record<string, unknown>;
  const raw = m.reasoning_content ?? m.reasoning ?? m.thinking ?? "";
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(m.reasoning_details)) {
    return m.reasoning_details
      .map((rd) => {
        if (rd && typeof rd === "object" && "text" in rd) {
          return String((rd as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

/** Modelos em que faz sentido pedir raciocínio explícito à API. */
export function modeloSuportaRaciocinioExplicito(modelo: string, baseUrl: string): boolean {
  const m = modelo.toLowerCase();
  if (/groq\.com/i.test(baseUrl)) {
    return /gpt-oss|qwen3/i.test(m);
  }
  if (/cerebras\.ai/i.test(baseUrl)) {
    return /zai-glm|glm-4|gpt-oss|gemma-4/i.test(m);
  }
  if (/openrouter\.ai/i.test(baseUrl)) {
    // qwen3* (inclui qwen3.6-plus) tem thinking nativo no OpenRouter — sem isso
    // o fallback XML pedía pt-BR enquanto o canal reasoning vinha em inglês.
    return /ring|deepseek.*r[1-9]|deepseek.*flash|deepseek.*pro|qwen3|qwen.*thinking|mai-ds-r|thinking/i.test(
      m,
    );
  }
  return /thinking|r1|gpt-oss|qwen3/i.test(m);
}

/** Fallback CoT por prompt quando a API não expõe reasoning nativo. */
export function precisaRaciocinioPorPrompt(
  modelo: string,
  baseUrl: string,
  raciocinioAtivo = true,
): boolean {
  if (!raciocinioAtivo) return false;
  return !modeloSuportaRaciocinioExplicito(modelo, baseUrl);
}

/**
 * Idioma + higiene do pensamento — vale pro canal nativo (reasoning/thinking) E pro XML.
 * Sem isto, Qwen/DeepSeek costumam raciocinar em inglês e ainda despejam o system prompt.
 */
const BLOCO_IDIOMA_RACIOCINIO =
  "IDIOMA E HIGIENE DO PENSAMENTO: o raciocínio interno (tokens de thinking/reasoning, " +
  "blocos <think>, planejamento) é SEMPRE em português do Brasil — nunca em inglês nem chinês. " +
  "Pensa em voz própria, 1ª pessoa, como a Luna. " +
  "PROIBIDO no pensamento: citar/quotar o system prompt ou briefing («the prompt says», " +
  "«Wait, the prompt», listas de gíria permitida/proibida, rótulos tipo Perfil de escrita); " +
  "analisar a pessoa em 3ª pessoa em inglês (Analyze the user's input, Response strategy); " +
  "despejar metadados (cidade, UF, localização, clima) como se fosse relatório. " +
  "Se precisa do lugar pra falar natural, usa sem narrar a fonte. A resposta visível também é pt-BR.";

/** Injeta sempre que o raciocínio estiver ligado (nativo ou por prompt). */
export function blocoPromptIdiomaRaciocinio(): string {
  return BLOCO_IDIOMA_RACIOCINIO;
}

const BLOCO_RACIOCINIO_PROMPT =
  "Antes da resposta visível ao usuário, escreve o seu raciocínio em português do Brasil " +
  "num bloco de raciocínio delimitado (tags XML think de abertura e fecho). " +
  "Esse bloco também é lido pela pessoa — continua na primeira pessoa, dentro da personagem, " +
  "sem citar rótulos do briefing (ex.: 'Olhando para o briefing', 'Perfil de escrita', 'Famílias de humor', 'Calor textual'), " +
  "sem listar marcações de sistema e sem falar de si mesma como um processo, modelo ou código. " +
  "Pensa em voz própria: o que sentiu, o que percebeu na mensagem, o que pretende responder. " +
  "Depois escreve a resposta final — sem repetir o bloco de raciocínio.";

export function blocoPromptRaciocinioInline(): string {
  return BLOCO_RACIOCINIO_PROMPT;
}

export type ExtracaoRaciocinioInline = {
  raciocinio?: string;
  conteudo: string;
};

/** Separa pensamento inline (CoT) do texto final quando o modelo não usa campos da API. */
export function extrairRaciocinioInline(conteudo: string): ExtracaoRaciocinioInline {
  const raw = conteudo.trim();
  if (!raw) return { conteudo: "" };

  const thinkBlock = raw.match(/([\s\S]*?)<\/think>\s*([\s\S]*)/i);
  if (thinkBlock?.[1]?.trim()) {
    const raciocinio = thinkBlock[1]!.replace(/^[\s\S]*?>/, "").trim() || thinkBlock[1]!.trim();
    const resto = thinkBlock[2]?.trim() ?? "";
    return { raciocinio, conteudo: resto || raw };
  }

  const thinkingMatch = raw.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  if (thinkingMatch?.[1]?.trim()) {
    return {
      raciocinio: thinkingMatch[1]!.trim(),
      conteudo: raw.replace(/<thinking>[\s\S]*?<\/thinking>/i, "").trim() || raw,
    };
  }

  const fenceMatch = raw.match(/```think\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]?.trim()) {
    return {
      raciocinio: fenceMatch[1]!.trim(),
      conteudo: raw.replace(/```think\s*[\s\S]*?```/i, "").trim() || raw,
    };
  }

  return { conteudo: raw };
}

const META_INSTRUCTION_TERMS = [
  /olhando para o briefing/i,
  /perfil de escrita/i,
  /fam[ií]lias de humor/i,
  /calor textual/i,
  /interjei[çc][õo]es/i,
  /pergunta final/i,
  /arqu[eé]tipo/i,
  /modos de presen[çc]a/i,
  /ajustes de tom/i,
  /guia markdown/i,
  /antipadr[õo]es/i,
  /o usu[áa]rio disse/i,
  /o usu[áa]rio [ée]/i,
  // «vou responder» é fala natural da Luna — NÃO bloquear.
  /\bresposta final\b/i,
  /\bbriefing\b/i,
  // Vazamentos típicos do Qwen (inglês + citação do system)
  /the prompt says/i,
  /wait,\s*the prompt/i,
  /system prompt/i,
  /analyze the user'?s input/i,
  /determine (the )?response strategy/i,
  /response strategy/i,
  /thinking process/i,
  /user'?s location/i,
  /user'?s input/i,
  /match their brevity/i,
  /g[ií]ria leve [ée] natural/i,
  /proibido g[ií]ria/i,
  /mano,\s*par[cç]a,\s*chefia/i,
  /localiza[cç][aã]o (do|da) (usu[aá]rio|pessoa)/i,
];

/** Heurística: CoT em inglês estruturado (quase sempre dump de prompt + meta). */
function raciocinioPareceMetaIngles(texto: string): boolean {
  const t = texto.trim();
  if (t.length < 40) return false;
  const sinais = [
    /\b(analyze|determine|strategy|acknowledge|context tracking)\b/i,
    /\b(the prompt says|user'?s (input|location|message))\b/i,
    /\b(I should|I'll|I will|Let me)\b/,
    /\b(Thinking Process|Response Strategy)\b/i,
  ];
  const hits = sinais.filter((re) => re.test(t)).length;
  // Letras latinas sem acento + poucas palavras pt comuns → inglês dominante
  const palavras = t.split(/\s+/).filter(Boolean);
  const ptComuns =
    palavras.filter((p) =>
      /^(eu|você|voce|não|nao|tá|ta|pra|porque|então|entao|isso|aqui|nossa|eita|cara)$/i.test(
        p.replace(/[^\p{L}]/gu, ""),
      ),
    ).length;
  const enComuns = palavras.filter((p) =>
    /^(the|and|user|prompt|should|their|this|that|with|from|what|why)$/i.test(
      p.replace(/[^\p{L}]/gu, ""),
    ),
  ).length;
  return hits >= 2 || (enComuns >= 8 && ptComuns <= 2);
}

function raciocinioPareceDumpDeInstrucoes(texto: string): boolean {
  const linhas = texto.split(/\n+/).filter((l) => l.trim());
  let matches = 0;
  for (const linha of linhas) {
    if (META_INSTRUCTION_TERMS.some((re) => re.test(linha))) matches++;
  }
  if (matches >= 2 || matches / Math.max(linhas.length, 1) > 0.25) return true;
  return raciocinioPareceMetaIngles(texto);
}

/** Remove parágrafos que reproduzem o briefing / meta-instruções. */
export function sanitizarRaciocinioParaCliente(raciocinio?: string): string | undefined {
  if (!raciocinio?.trim()) return undefined;

  // Dump óbvio: some tudo — melhor caixa vazia do que vazar system/localização.
  if (raciocinioPareceDumpDeInstrucoes(raciocinio) || raciocinioPareceMetaIngles(raciocinio)) {
    return undefined;
  }

  const paragrafos = raciocinio
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const limpos = paragrafos.filter((p) => {
    const primeiraLinha = p.split(/\n/)[0] ?? "";
    const pareceMeta = META_INSTRUCTION_TERMS.some((re) => re.test(p) || re.test(primeiraLinha));
    const soMarcador = /^\s*[-–—•*\d.]+\s*$/.test(p) || /^\s*[-–—•]\s*/.test(p) && p.length < 8;
    return !pareceMeta && !soMarcador;
  });

  const resultado = limpos.join("\n\n").trim();
  if (!resultado) return undefined;
  // Re-checa o que sobrou (às vezes o dump fica num parágrafo só).
  if (raciocinioPareceDumpDeInstrucoes(resultado) || raciocinioPareceMetaIngles(resultado)) {
    return undefined;
  }
  return resultado;
}

/** Resolve raciocínio: campos da API primeiro, depois tags inline no conteúdo. */
export function resolverRaciocinioResposta(
  mensagem: unknown,
  conteudo: string,
): { conteudo: string; raciocinio?: string } {
  const daApi = extrairRaciocinioDeMensagem(mensagem);
  // Sempre extraímos as tags inline do CONTEÚDO — mesmo quando a API já devolveu um
  // campo de raciocínio próprio. Antes o curto-circuito devolvia o conteúdo INTACTO
  // quando `daApi` existia, e aí um <think>…</think> deixado no meio da resposta
  // (o modelo às vezes faz as duas coisas) escapava pro texto visível. Era o modo
  // do vazamento de 3ª pessoa no modo pesquisa. O strip inline só corta blocos
  // DELIMITADOS, então é seguro rodar sempre.
  const inline = extrairRaciocinioInline(conteudo);
  if (daApi) {
    return { conteudo: inline.conteudo, raciocinio: sanitizarRaciocinioParaCliente(daApi) };
  }
  return {
    conteudo: inline.conteudo,
    raciocinio: sanitizarRaciocinioParaCliente(inline.raciocinio),
  };
}

/** Ajusta o corpo da requisição OpenAI-compatível para pedir ou ocultar raciocínio. */
export function aplicarCorpoRaciocinio(
  corpo: Record<string, unknown>,
  modelo: string,
  baseUrl: string,
  ativo: boolean,
  temFerramentas: boolean,
  effort?: "low" | "medium" | "high",
): void {
  if (!modeloSuportaRaciocinioExplicito(modelo, baseUrl)) return;

  const m = modelo.toLowerCase();
  if (/groq\.com/i.test(baseUrl)) {
    if (/gpt-oss/i.test(m)) {
      // Groq rejeita include_reasoning + reasoning_format juntos — só reasoning_format
      corpo.reasoning_format = ativo ? "parsed" : "hidden";
    } else if (/qwen3/i.test(m)) {
      if (temFerramentas || ativo) {
        corpo.reasoning_format = ativo ? "parsed" : "hidden";
      }
    }
    return;
  }

  const effortValor = effort ?? process.env.CEREBRAS_REASONING_EFFORT?.trim().toLowerCase() ?? "medium";
  const effortNormalizado: "low" | "medium" | "high" | "none" =
    effortValor === "low" || effortValor === "medium" || effortValor === "high" || effortValor === "none"
      ? effortValor
      : "medium";

  if (/openrouter\.ai/i.test(baseUrl)) {
    if (ativo) {
      corpo.reasoning = { effort: effortNormalizado === "none" ? "medium" : effortNormalizado };
    } else {
      corpo.reasoning = { effort: "none" };
    }
    return;
  }

  if (/cerebras\.ai/i.test(baseUrl)) {
    if (/gemma-4/i.test(m)) {
      if (ativo) {
        corpo.reasoning_effort = effortNormalizado === "none" ? "low" : effortNormalizado;
        corpo.reasoning_format = "parsed";
      }
      return;
    }

    if (/zai-glm|glm-4/i.test(m)) {
      if (ativo) {
        corpo.reasoning_format = "parsed";
        corpo.reasoning_effort = effortNormalizado === "none" ? "none" : effortNormalizado;
      } else {
        corpo.reasoning_effort = "none";
        corpo.reasoning_format = "hidden";
      }
      return;
    }

    if (/gpt-oss/i.test(m)) {
      corpo.reasoning_format = ativo ? "parsed" : "hidden";
      if (ativo && effortNormalizado !== "none") {
        corpo.reasoning_effort = effortNormalizado;
      }
    }
  }
}
