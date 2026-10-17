/**
 * Entry point para integração desktop (Orbit / Electron).
 * Carrega .env do pacote e expõe o pipeline completo.
 */
import "./carregarEnv.js";
export type { ProvedorLlm, ProvedorAgente, ConfigLuna } from "./providers/tipos.js";
export {
  criarProvedorOpenAi,
  type OpcoesOpenAi,
} from "./providers/openaiCompativel.js";
export {
  configurarDiretoriosDados,
  obterDiretoriosDados,
  DIRETORIOS_DADOS_PADRAO,
  type ConfigDiretoriosDados,
  type DiretoriosDados,
} from "./config/diretoriosDados.js";
export {
  normalizarLunaError,
  type SerializedLunaError,
} from "./erros/lunaError.js";
export {
  criarCacheMundoVazio,
  executarComCacheMundo,
  type CacheMundoPersistencia,
} from "./persistencia/contextoMundo.js";
export {
  executarPipelineCompleto,
  type ResultadoCompleto,
  type OpcoesPipelineCompleto,
} from "./pipeline/executarPipelineCompleto.js";
export {
  executarAgenteIde,
  type OpcoesPipelineIde,
  type ResultadoAgenteIde,
  type SnapshotWorkspace,
  type PlanoExecucao,
  type PassoExecucao,
  type ResultadoAvaliador,
} from "./pipeline/executarAgenteIde.js";
export {
  prepararSessaoOrbit,
  buscarContextoOutrasSessoes,
  listarMemoriaLongaResumo,
  executarReflexaoSessao,
  vincularSessaoOrbit,
  hidratarSessaoOrbit,
  redefinirSessaoOrbit,
  type FatoMemoriaLongaResumo,
  type ResultadoReflexaoOrbit,
  type OpcoesBuscaContextoCross,
} from "./integracao/orbitIntegracao.js";
