import { z } from "zod";

/** Intenções detectadas pelo Analisador de Contexto (modelo menor). */
export const IntencaoSchema = z.enum([
  "conversa_casual",
  "pergunta_identitaria",
  "pergunta_tecnica",
  "pedido_codigo",
  "projeto_arquitetural",
  "apoio_emocional",
  "acao_critica",
  "brainstorm_criativo",
  "expressao_afetiva",
  "pergunta_arquitetura",
  "pergunta_ecossistema",
  "pergunta_produto",
  "reivindicacao_criador",
]);

export const ComplexidadeSchema = z.enum(["baixa", "media", "alta"]);

export const NivelRiscoSchema = z.enum([
  "nenhum",
  "baixo",
  "medio",
  "alto",
  "critico",
]);

/** Saída estruturada do Analisador de Contexto — sem persona, só classificação. */
export const AnaliseContextoSchema = z.object({
  intencao: IntencaoSchema,
  complexidade: ComplexidadeSchema,
  nivel_risco: NivelRiscoSchema,
  requer_markdown: z.boolean(),
  requer_codigo: z.boolean(),
  /** R10 — detecção pura: a mensagem envolve uma operação de ferramenta (independente de bloquear). */
  envolve_ferramenta: z.boolean().default(false).describe(
    "A mensagem envolve uma operação de ferramenta (independente da política permitir ou bloquear)",
  ),
  /** R10 — permissão: a política permite usar a ferramenta; false quando ação é bloqueada. */
  requer_ferramenta: z.boolean().describe(
    "A política permite usar a ferramenta neste contexto (false quando acao=bloquear)",
  ),
  requer_memoria: z.boolean(),
  deve_perguntar_mais: z.boolean(),
  confianca: z.number().min(0).max(1),
  motivos: z.array(z.string()),
});

export type AnaliseContexto = z.infer<typeof AnaliseContextoSchema>;

export type AcaoPolitica = z.infer<typeof AcaoPoliticaSchema>;
export type FormatoResposta = z.infer<typeof FormatoRespostaSchema>;
export type TomResposta = z.infer<typeof TomRespostaSchema>;
export type Autonomia = z.infer<typeof AutonomiaSchema>;
export type AcaoMemoria = z.infer<typeof AcaoMemoriaSchema>;
export type NivelRisco = z.infer<typeof NivelRiscoSchema>;

/** Ação que a Luna deve tomar nesta interação. */
export const AcaoPoliticaSchema = z.enum([
  "responder",
  "perguntar",
  "usar_ferramenta",
  "chamar_agente",
  "aguardar",
  "transitar",
  "bloquear",
]);

export const FormatoRespostaSchema = z.enum([
  "texto_simples",
  "markdown",
  "codigo",
  "tabela",
]);

export const TomRespostaSchema = z.enum([
  "tecnico_acolhedor",
  "casual",
  "serio",
  "breve",
  "brincalhao",
  "acolhedor_afetivo",
]);

export const AutonomiaSchema = z.enum([
  "nenhuma",
  "sugerir",
  "pedir_permissao",
  "executar",
]);

export const AcaoMemoriaSchema = z.enum([
  "nenhuma",
  "armazenar",
  "atualizar",
  "solicitar_confirmacao",
]);

export const NivelFormatoMdSchema = z.enum(["nenhum", "leve", "estruturado"]);

export type NivelFormatoMd = z.infer<typeof NivelFormatoMdSchema>;

/** Política compacta gerada pelo Compositor de Decisão — guia o Respondedor (modelo grande). */
export const PoliticaDecisaoSchema = z.object({
  modo: z.string(),
  acao: AcaoPoliticaSchema,
  formato: FormatoRespostaSchema,
  markdown_permitido: z.boolean(),
  nivel_formato_md: NivelFormatoMdSchema.optional().default("nenhum"),
  tom: TomRespostaSchema,
  autonomia: AutonomiaSchema,
  acao_memoria: AcaoMemoriaSchema,
  nivel_seguranca: NivelRiscoSchema,
  diretrizes_ativas: z.array(z.string()),
});

export type PoliticaDecisao = z.infer<typeof PoliticaDecisaoSchema>;

/** Uma diretriz da Constituição Luna. */
export const DiretrizSchema = z.object({
  id: z.string(),
  categoria: z.string(),
  descricao: z.string().optional(),
  peso_base: z.number().min(0).max(100).optional(),
  regra_absoluta: z.boolean().optional(),
  imutavel: z.boolean().optional(),
  etiquetas: z.array(z.string()).optional(),
  modificadores_contextuais: z.record(z.string(), z.number()).optional(),
  conflita_com: z.array(z.string()).optional(),
  aplica_quando: z.array(z.string()).optional(),
});

export const CamadaConstituicaoSchema = z.object({
  versao: z.string(),
  camada: z.string(),
  entradas: z.array(DiretrizSchema),
});

export type Diretriz = z.infer<typeof DiretrizSchema>;
export type CamadaConstituicao = z.infer<typeof CamadaConstituicaoSchema>;

/** Saída do Seletor Constitucional (V0.2+). */
export const SelecaoConstitucionalSchema = z.object({
  diretrizes_selecionadas: z.array(z.string()),
  analise: z.object({
    intencao: z.string(),
    complexidade: ComplexidadeSchema,
    risco: NivelRiscoSchema,
  }),
  confianca: z.number().min(0).max(1),
});

export type SelecaoConstitucional = z.infer<typeof SelecaoConstitucionalSchema>;
