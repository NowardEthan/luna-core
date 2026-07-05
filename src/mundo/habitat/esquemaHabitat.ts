import { z } from "zod";

export const AmbienteHabitatSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  descricao: z.string().min(1),
  tags: z.array(z.string()).default([]),
  slice_contexto: z.string().min(1),
  ativo_padrao: z.boolean().default(false),
});

export const CatalogoHabitatSchema = z.object({
  versao: z.string().min(1),
  ambientes: z.array(AmbienteHabitatSchema).min(1),
});

export const EstadoHabitatSchema = z.object({
  ambiente_id: z.string().min(1),
  atualizado_em: z.string().min(1),
});

export type AmbienteHabitat = z.infer<typeof AmbienteHabitatSchema>;
export type CatalogoHabitat = z.infer<typeof CatalogoHabitatSchema>;
export type EstadoHabitat = z.infer<typeof EstadoHabitatSchema>;
