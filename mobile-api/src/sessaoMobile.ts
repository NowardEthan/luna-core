import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { resolveLunaCorePath } from "./resolveCorePath.js";
import { compactarSessaoMobile } from "./truncateForGroq.js";
import type { MemoriaSessaoMobile } from "./typesMemoriaMobile.js";

/** Import dinâmico de módulos do luna-core em runtime (evita resolver ../../src no tsc do mobile-api). */
export async function importModuloLunaCore<T extends object>(
  relativePath: string,
): Promise<T> {
  const corePath = resolveLunaCorePath();
  const href = pathToFileURL(join(corePath, relativePath)).href;
  return (await import(href)) as T;
}

type GerenciadorSessaoMod = {
  obterOuCriarSessao: (sessionId: string) => MemoriaSessaoMobile;
};

type StoreSessaoMod = {
  salvarSessao: (sessao: MemoriaSessaoMobile) => void;
};

export async function compactarSessaoPersistida(sessionId: string): Promise<void> {
  const [gerenciador, store] = await Promise.all([
    importModuloLunaCore<GerenciadorSessaoMod>("src/memoria/gerenciadorSessao.js"),
    importModuloLunaCore<StoreSessaoMod>("src/memoria/storeSessao.js"),
  ]);
  const sessao = gerenciador.obterOuCriarSessao(sessionId);
  compactarSessaoMobile(sessao);
  store.salvarSessao(sessao);
}
