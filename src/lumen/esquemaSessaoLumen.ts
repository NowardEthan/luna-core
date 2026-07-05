import { z } from "zod";

/** Esquema Zod da sessão Lumen — contrato R0/R2: o que a Luna gera, o Orbit renderiza. */

export const LumenChoiceSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  diagnosis: z.string().min(1).optional(),
});

export const LumenMicroCheckSchema = z.object({
  question: z.string().min(1),
  choices: z.array(LumenChoiceSchema).min(2).max(4),
  correctId: z.string().min(1),
  reteach: z.string().min(1),
  reveal: z.string().min(1),
  correctNote: z.string().min(1).optional(),
});

export const LumenTeachBeatSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fala"), text: z.string().min(1).max(180) }),
  z.object({
    kind: z.literal("destaque"),
    text: z.string().min(1).max(120),
    emoji: z.string().optional(),
  }),
  z.object({
    kind: z.literal("analogia"),
    de: z.string().min(1).max(80),
    para: z.string().min(1).max(120),
    emojiDe: z.string().optional(),
    emojiPara: z.string().optional(),
  }),
]);

export const LumenLessonStepSchema = z
  .object({
    id: z.string().min(1),
    teach: z.string().min(1).optional(),
    beats: z.array(LumenTeachBeatSchema).min(2).max(5).optional(),
    example: z.string().min(1).optional(),
    check: LumenMicroCheckSchema,
    explainAgain: z.string().min(1).optional(),
    explainAgainBeats: z.array(LumenTeachBeatSchema).min(2).max(4).optional(),
  })
  .refine((s) => Boolean(s.teach) || (s.beats?.length ?? 0) > 0, {
    message: "Cada passo de aula precisa de beats (preferido) ou teach",
  });

export const LumenRubricPointSchema = z.object({
  text: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1),
});

export const LumenFeynmanItemSchema = z.object({
  id: z.string().min(1),
  type: z.literal("feynman"),
  prompt: z.string().min(1),
  guides: z.array(z.string().min(1)).optional(),
  warmup: LumenMicroCheckSchema.optional(),
  rubric: z.array(LumenRubricPointSchema).min(1),
  sampleAnswer: z.string().min(1),
  topic: z.string().min(1).optional(),
  cosmo: z.number().int().min(0),
});

export const LumenFlashcardItemSchema = z.object({
  id: z.string().min(1),
  type: z.literal("flashcard"),
  front: z.string().min(1),
  back: z.string().min(1),
  hint: z.string().min(1).optional(),
  keywords: z.array(z.string().min(1)).optional(),
  topic: z.string().min(1).optional(),
  cosmo: z.number().int().min(0),
});

export const LumenCenaAberturaSchema = z.object({
  fala: z.string().min(1).max(200),
  emoji: z.string().optional(),
});

export const LumenQuizItemSchema = z.object({
  id: z.string().min(1),
  type: z.literal("quiz"),
  prompt: z.string().min(1),
  choices: z.array(LumenChoiceSchema).min(2),
  correctId: z.string().min(1),
  explanation: z.string().min(1),
  explainAgain: z.string().min(1).optional(),
  explainAgainBeats: z.array(LumenTeachBeatSchema).min(2).max(4).optional(),
  context: z.object({ origem: z.string(), detalhe: z.string().optional() }).optional(),
  cena: LumenCenaAberturaSchema.optional(),
  topic: z.string().min(1).optional(),
  source: z.string().optional(),
  cosmo: z.number().int().min(0),
});

export const LumenMontarItemSchema = z.object({
  id: z.string().min(1),
  type: z.literal("montar"),
  prompt: z.string().min(1),
  cena: LumenCenaAberturaSchema.optional(),
  pecas: z.array(z.string().min(1)).min(2).max(8),
  distratoras: z.array(z.string().min(1)).optional(),
  explanation: z.string().min(1),
  explainAgain: z.string().min(1).optional(),
  explainAgainBeats: z.array(LumenTeachBeatSchema).min(2).max(4).optional(),
  context: z.object({ origem: z.string(), detalhe: z.string().optional() }).optional(),
  topic: z.string().min(1).optional(),
  cosmo: z.number().int().min(0),
});

export const LumenTeachLunaItemSchema = z.object({
  id: z.string().min(1),
  type: z.literal("ensina_luna"),
  scenario: z.string().min(1),
  statements: z.array(LumenChoiceSchema).min(2),
  wrongId: z.string().min(1),
  fix: z.string().min(1),
  praise: z.string().min(1),
  hint: z.string().min(1),
  topic: z.string().min(1).optional(),
  cosmo: z.number().int().min(0),
});

export const LumenItemSchema = z.discriminatedUnion("type", [
  LumenQuizItemSchema,
  LumenFlashcardItemSchema,
  LumenFeynmanItemSchema,
  LumenTeachLunaItemSchema,
  LumenMontarItemSchema,
]);

const introBeatsField = { introBeats: z.array(LumenTeachBeatSchema).min(1).max(4).optional() };

const LumenAulaStageSchema = z.object({
  moment: z.literal("aula"),
  title: z.string().min(1),
  intro: z.string().min(1),
  ...introBeatsField,
  steps: z.array(LumenLessonStepSchema).min(1),
  closer: LumenFeynmanItemSchema.optional(),
});

const LumenItemsStageSchema = z.object({
  moment: z.enum(["pratica", "prova", "revisao"]),
  title: z.string().min(1),
  intro: z.string().min(1),
  ...introBeatsField,
  items: z.array(LumenItemSchema).min(1),
});

export const LumenSessionSchema = z.object({
  topic: z.string().min(1),
  subtitle: z.string().min(1),
  mode: z.enum(["aprendizado", "revisao"]).optional(),
  hook: z.object({ question: z.string().min(1), tease: z.string().optional() }).optional(),
  stages: z.array(z.union([LumenAulaStageSchema, LumenItemsStageSchema])).min(1),
});

export type SessaoLumen = z.infer<typeof LumenSessionSchema>;
export type PassoAulaLumen = z.infer<typeof LumenLessonStepSchema>;
export type ItemLumen = z.infer<typeof LumenItemSchema>;
export type ItemFeynmanLumen = z.infer<typeof LumenFeynmanItemSchema>;
