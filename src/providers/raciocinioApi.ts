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
    return /ring|deepseek.*r[1-9]|deepseek.*flash|qwen.*thinking|mai-ds-r|thinking/i.test(m);
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

const BLOCO_RACIOCINIO_PROMPT =
  "Antes da resposta visível ao usuario, escreve o teu raciocinio em portugues do Brasil " +
  "num bloco de raciocinio delimitado (tags XML think de abertura e fecho). " +
  "Esse bloco tambem e lido pela pessoa — continua na primeira pessoa, dentro da personagem, " +
  "sem citar rotulos do briefing (ex.: 'Olhando para o briefing', 'Perfil de escrita', 'Familias de humor', 'Calor textual'), " +
  "sem listar marcacoes de sistema e sem falar de ti mesma como um processo, modelo ou codigo. " +
  "Pensa em voz propria: o que sentiu, o que percebeu na mensagem, o que pretende responder. " +
  "Depois escreve a resposta final — sem repetir o bloco de raciocinio.";

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
  /vou responder/i,
  /resposta final/i,
  /\bbriefing\b/i,
];

function raciocinioPareceDumpDeInstrucoes(texto: string): boolean {
  const linhas = texto.split(/\n+/).filter((l) => l.trim());
  let matches = 0;
  for (const linha of linhas) {
    if (META_INSTRUCTION_TERMS.some((re) => re.test(linha))) matches++;
  }
  return matches >= 2 || matches / Math.max(linhas.length, 1) > 0.25;
}

/** Remove parágrafos que reproduzem o briefing / meta-instruções. */
export function sanitizarRaciocinioParaCliente(raciocinio?: string): string | undefined {
  if (!raciocinio?.trim()) return undefined;

  const paragrafos = raciocinio
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const limpos = paragrafos.filter((p) => {
    const primeiraLinha = p.split(/\n/)[0] ?? "";
    const pareceMeta = META_INSTRUCTION_TERMS.some((re) => re.test(p) || re.test(primeiraLinha));
    const soMarcador = /^\s*[-–—•]\s*/.test(p);
    return !pareceMeta && !soMarcador;
  });

  const resultado = limpos.join("\n\n");
  if (!resultado.trim() || raciocinioPareceDumpDeInstrucoes(raciocinio)) {
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
  if (daApi) {
    return { conteudo, raciocinio: sanitizarRaciocinioParaCliente(daApi) };
  }
  const inline = extrairRaciocinioInline(conteudo);
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
