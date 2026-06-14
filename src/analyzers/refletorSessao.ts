import { z } from "zod";
import type { ProvedorLlm } from "../providers/tipos.js";
import type { MemoriaSessao } from "../memoria/esquemaMemoria.js";

export const CandidatoMemoriaSchema = z.object({
  acao: z.enum(["armazenar", "confirmar", "ignorar"]).describe(
    "Use 'armazenar' para preferências não-sensíveis triviais. 'confirmar' para dados sensíveis, deduzidos ou opiniões fortes. 'ignorar' para lixo/temporário."
  ),
  tipo: z.enum(["fato_geral", "preferencia", "informacao_sensivel", "outro"]),
  conteudo: z.string().describe("Fato isolado de forma clara e atemporal"),
  motivo: z.string().describe("Justificativa para gerar esse candidato e sua respectiva ação"),
  visibilidade_uso: z.enum([
    "silenciosa",
    "mencionar_quando_relevante",
    "mencionar_se_perguntado",
    "nunca_mencionar_sem_confirmacao"
  ]).describe("O quão livre a Luna é para falar sobre isso. Sensíveis devem ser silenciosas ou nunca_mencionar"),
  utilidade_futura: z.enum(["baixa", "media", "alta"]).describe("Se o fato terá valor no futuro. Baixa = ignorar."),
  confianca: z.number().min(0.0).max(1.0).describe("Nível de confiança nessa dedução (0 a 1)"),
});

export const ReflexaoSchema = z.object({
  candidatos: z.array(CandidatoMemoriaSchema),
});

export type CandidatoMemoria = z.infer<typeof CandidatoMemoriaSchema>;
export type ResultadoReflexao = z.infer<typeof ReflexaoSchema>;

const PROMPT_REFLETOR = `Você é o Neurônio de Reflexão Pós-Sessão da Luna.
Sua missão é ler o histórico de uma conversa recente e extrair "candidatos" a memórias longas.
Diferente da memória imediata, a reflexão deduz coisas cruciais que o usuário NÃO pediu expressamente para salvar, mas que seriam úteis para a identidade dele.

Retorne APENAS um JSON válido com o seguinte formato exato:
{
  "candidatos": [
    {
      "acao": "armazenar" | "confirmar" | "ignorar",
      "tipo": "fato_geral" | "preferencia" | "informacao_sensivel" | "outro",
      "conteudo": "Fato isolado de forma clara e atemporal",
      "motivo": "Justificativa",
      "visibilidade_uso": "silenciosa" | "mencionar_quando_relevante" | "mencionar_se_perguntado" | "nunca_mencionar_sem_confirmacao",
      "utilidade_futura": "baixa" | "media" | "alta",
      "confianca": 0.9
    }
  ]
}

Se não houver NADA a refletir, retorne:
{
  "candidatos": []
}

REGRAS ESTritas:
1. Risco de Privacidade (R-M15): NUNCA envie uma inferência sobre ansiedade, neurodivergência, saúde ou dados financeiros como 'armazenar'. Devem ser SEMPRE marcados como 'confirmar'.
2. Invasão de Intimidade (R-M18): Se não tem certeza, use acao: 'ignorar' ou confianca baixa.
3. Não crie lixo: Ignore bom dia, tchau, piadas e papo furado.
4. Clareza (R-M10): A memória não define a pessoa. Ex: "Usuário mencionou que X".
5. Vínculo e Utilidade (R-M20, R-M21): Expressões afetivas isoladas ("te amo viu", "quero conversar", "obrigado") devem ser ignoradas, não confirmadas. Só gere candidato se houver uma preferência persistente ou pedido explícito de memória.
6. Ação e Utilidade:
   - utilidade_futura baixa → acao: 'ignorar'
   - utilidade_futura media → 'armazenar' se não sensível, ou 'confirmar'
   - utilidade_futura alta → 'armazenar' ou 'confirmar' conforme sensibilidade
7. Autoria e Identidade (R-M24): Preserve o sujeito. Se o usuário falar "eu te criei" ou "estou te projetando", não abstraia para "interesse em IA". Grave "Usuário mencionou que me criou/projetou".

Analise o histórico abaixo e retorne APENAS O JSON.
`;

export function extrairJson(texto: string): unknown {
  const bloco = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  const bruto = bloco ? bloco[1]!.trim() : texto.trim();
  try {
    return JSON.parse(bruto) as unknown;
  } catch (e) {
    return { candidatos: [] };
  }
}

export async function refletirSessao(
  sessao: MemoriaSessao,
  provedor: ProvedorLlm,
  modelo: string
): Promise<{ candidatos: CandidatoMemoria[]; latencia_ms: number }> {
  const inicio = Date.now();

  const textoSessao = sessao.mensagens.map(m => `[${m.papel}] ${m.conteudo}`).join("\n");
  const promptFinal = `${PROMPT_REFLETOR}\n\n=== HISTÓRICO DA SESSÃO ===\n${textoSessao}`;

  const resposta = await provedor.completar({
    modelo,
    temperatura: 0.1,
    json: true,
    mensagens: [
      { papel: "system", conteudo: promptFinal }
    ]
  });

  const bruto = extrairJson(resposta.conteudo);
  const json = ReflexaoSchema.parse(bruto);
  const latencia_ms = Date.now() - inicio;

  return { candidatos: json.candidatos ?? [], latencia_ms };
}
