import { pipeline, env, type PipelineType } from "@xenova/transformers";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Cache de modelos na raiz do pacote (não depende de process.cwd)

const RAIZ_PACOTE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
env.cacheDir = join(RAIZ_PACOTE, "logs", "modelos");

export interface EmbeddingProvider {
  gerarEmbedding(texto: string): Promise<number[]>;
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  private modeloNome: string;
  private pipePromise: Promise<any> | null = null;

  constructor(modeloNome: string = "Xenova/all-MiniLM-L6-v2") {
    this.modeloNome = modeloNome;
  }

  private async getPipe() {
    if (!this.pipePromise) {
      this.pipePromise = pipeline("feature-extraction" as PipelineType, this.modeloNome, {
        quantized: true, // Mantém modelo rápido e leve
      });
    }
    return this.pipePromise;
  }

  async gerarEmbedding(texto: string): Promise<number[]> {
    const timeoutMs = Number.parseInt(process.env.LUNA_EMBEDDINGS_TIMEOUT_MS?.trim() ?? "8000", 10);
    const pipe = await this.getPipe();
    const embed = pipe(texto, { pooling: "mean", normalize: true });
    const saida = await Promise.race([
      embed,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout ao gerar embedding")), timeoutMs),
      ),
    ]);
    return Array.from(saida.data);
  }
}

// Singleton global
let defaultProvider: EmbeddingProvider | null = null;

export function obterMotorEmbeddings(): EmbeddingProvider {
  if (!defaultProvider) {
    defaultProvider = new LocalEmbeddingProvider();
  }
  return defaultProvider;
}
