/** Subconjunto de MemoriaSessao usado só pela mobile-api (sem importar o core no build). */
export type MemoriaSessaoMobile = {
  mensagens: Array<{ conteudo: string }>;
};
