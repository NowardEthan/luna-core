/**
 * Entry point para integração desktop (Orbit / Electron).
 * Carrega .env do pacote e expõe o pipeline completo.
 */
import "./carregarEnv.js";
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
  type FatoMemoriaLongaResumo,
  type ResultadoReflexaoOrbit,
  type OpcoesBuscaContextoCross,
} from "./integracao/orbitIntegracao.js";
