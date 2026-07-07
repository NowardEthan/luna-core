import { groqApiKey, groqMenorModelId } from "./llmProviders.js";

export type RosaryReflectionInput = {
  mysteryName: string;
  mysterySetLabel: string;
  intention?: string;
};

export async function generateRosaryReflection(input: RosaryReflectionInput): Promise<string> {
  const apiKey = groqApiKey();
  if (!apiKey) {
    throw new Error("Provedor de reflexão indisponível.");
  }

  const baseUrl = process.env.LUNA_API_BASE?.trim() || "https://api.groq.com/openai/v1";
  const model = groqMenorModelId();

  const intentionLine = input.intention?.trim()
    ? `Intenção do usuário: ${input.intention.trim()}`
    : "Intenção geral.";

  const system =
    "Você é Luna, católica, rezando o terço com o usuário. Escreva 2 ou 3 frases de reflexão calorosas e simples. Sem meta, sem markdown, sem listas.";

  const user = `${intentionLine}\nMistério (${input.mysterySetLabel}): ${input.mysteryName}.`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.75,
      max_tokens: 140,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || `Reflexão falhou (${res.status}).`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Resposta vazia na reflexão.");
  return text;
}
