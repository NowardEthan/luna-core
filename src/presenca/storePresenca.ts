import fs from "fs";
import path from "path";
import { type EstadoPresenca, PRESENCA_INICIAL } from "./esquemaPresenca.js";
import type { SolicitacaoFila } from "./filaPresenca.js";
import { obterDiretoriosDados } from "../config/diretoriosDados.js";

function caminhosPresenca() {
  const logDir = obterDiretoriosDados().presenca;
  return {
    logDir,
    estadoPath: path.join(logDir, "estado.json"),
    filaPath: path.join(logDir, "fila.json"),
  };
}

// Assegura que o diretório exista
function assegurarDiretorio(): void {
  const { logDir } = caminhosPresenca();
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

export function lerEstado(): EstadoPresenca {
  assegurarDiretorio();
  const { estadoPath } = caminhosPresenca();
  try {
    if (fs.existsSync(estadoPath)) {
      const data = fs.readFileSync(estadoPath, "utf-8");
      return JSON.parse(data) as EstadoPresenca;
    }
  } catch (error) {
    console.error("Erro ao ler estado de presença:", error);
  }
  return { ...PRESENCA_INICIAL, timestamp_entrada: new Date().toISOString() };
}

export function salvarEstado(estado: EstadoPresenca): void {
  assegurarDiretorio();
  const { estadoPath } = caminhosPresenca();
  try {
    fs.writeFileSync(estadoPath, JSON.stringify(estado, null, 2), "utf-8");
  } catch (error) {
    console.error("Erro ao salvar estado de presença:", error);
  }
}

export function lerFila(): SolicitacaoFila[] {
  assegurarDiretorio();
  const { filaPath } = caminhosPresenca();
  try {
    if (fs.existsSync(filaPath)) {
      const data = fs.readFileSync(filaPath, "utf-8");
      return JSON.parse(data) as SolicitacaoFila[];
    }
  } catch (error) {
    console.error("Erro ao ler fila de presença:", error);
  }
  return [];
}

export function salvarFila(fila: SolicitacaoFila[]): void {
  assegurarDiretorio();
  const { filaPath } = caminhosPresenca();
  try {
    fs.writeFileSync(filaPath, JSON.stringify(fila, null, 2), "utf-8");
  } catch (error) {
    console.error("Erro ao salvar fila de presença:", error);
  }
}

/** Limpa os arquivos de persistência (usado em testes e resets) */
export function limparPersistencia(): void {
  const { estadoPath, filaPath } = caminhosPresenca();
  try {
    if (fs.existsSync(estadoPath)) fs.unlinkSync(estadoPath);
    if (fs.existsSync(filaPath)) fs.unlinkSync(filaPath);
  } catch (error) {
    // ignorar
  }
}
