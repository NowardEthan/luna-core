/** Contexto do interlocutor actual — definido só no servidor (mobile-api) ou CLI. */
export type InterlocutorPipeline = {
  uid: string;
  criador_verificado: boolean;
  display_name?: string;
};

export const UID_CRIADOR_CANONICO = "aKp1czWVMqWQdJ9nAIcIKgxKNu92";
