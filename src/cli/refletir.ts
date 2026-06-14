import "../carregarEnv.js";
import { parseArgs } from "node:util";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { carregarConfig } from "../providers/tipos.js";
import { criarProvedorOpenAi } from "../providers/openaiCompativel.js";
import { carregarSessao } from "../memoria/storeSessao.js";
import { refletirSessao } from "../analyzers/refletorSessao.js";
import { inserirFatoLongo } from "../memoria/longa/storeSqlite.js";
import { calcularSaliencia } from "../memoria/longa/calculadorSaliencia.js";
import { inferirCategoria } from "../memoria/longa/categorizador.js";
import { obterMotorEmbeddings } from "../memoria/longa/motorEmbeddings.js";

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║    Luna Core — Refletor Pós-Sessão   ║");
  console.log("╚══════════════════════════════════════╝\n");

  const { values } = parseArgs({
    options: {
      sessao: { type: "string" },
      ultima: { type: "boolean" },
    },
    strict: false,
  });

  const dirSessoes = join(process.cwd(), "logs", "sessoes");
  const pathUltima = join(dirSessoes, ".ultima-sessao");

  let sessaoId: string | undefined =
    typeof values.sessao === "string" ? values.sessao : undefined;
  if (values.ultima && existsSync(pathUltima)) {
    sessaoId = readFileSync(pathUltima, "utf8").trim();
  }

  if (!sessaoId || typeof sessaoId !== "string") {
    console.log("Uso: npm run refletir -- [--sessao UUID | --ultima]");
    process.exit(1);
  }

  const sessao = carregarSessao(sessaoId);
  if (!sessao) {
    console.log(`❌ Sessão não encontrada: ${sessaoId}`);
    process.exit(1);
  }

  const config = carregarConfig();
  if (!config) {
    console.log("❌ LUNA_API_KEY não configurada.");
    process.exit(1);
  }

  const provedor = criarProvedorOpenAi({ apiKey: config.apiKey, baseUrl: config.baseUrl });

  console.log(`▸ Analisando sessão: ${sessaoId} (${sessao.mensagens.length} mensagens)`);
  if (sessao.mensagens.length === 0) {
    console.log("Sessão vazia. Nada a refletir.");
    return;
  }

  console.log("▸ Refletindo (isso pode levar alguns segundos)...\n");
  const resultado = await refletirSessao(sessao, provedor, config.modeloMenor);

  console.log(`Resultados da Reflexão (Latência: ${resultado.latencia_ms}ms)`);
  console.log("----------------------------------------------------------");

  if (resultado.candidatos.length === 0) {
    console.log("Nenhum fato relevante encontrado para consolidar.");
    return;
  }

  const motor = obterMotorEmbeddings();

  for (const c of resultado.candidatos) {
    console.log(`[Ação: ${c.acao.toUpperCase()}] (${Math.round(c.confianca * 100)}% conf)`);
    console.log(`Fato: ${c.conteudo}`);
    console.log(`Motivo: ${c.motivo}`);
    
    if (c.acao === "ignorar") {
      console.log("→ Descartado.\n");
      continue;
    }

    if (c.confianca < 0.6) {
      console.log("→ Descartado por baixa confiança (<0.6).\n");
      continue;
    }

    try {
      const vetor = await motor.gerarEmbedding(c.conteudo);
      const embeddingJson = JSON.stringify(vetor);

      const status = c.acao === "confirmar" ? "pendente_confirmacao" : "ativo";

      let escopo: "longo_prazo" | "perfil" = "longo_prazo";
      if (c.tipo === "informacao_sensivel" || c.tipo === "preferencia") {
        escopo = "perfil";
      }

      const sensibilidade = c.tipo === "informacao_sensivel" ? "sensivel" : "normal";
      const salienciaInput = {
        tipo: c.tipo,
        sensibilidade,
        visibilidade_uso: c.visibilidade_uso,
        fonte_confirmacao: "inferencia_reflexao" as const,
        confianca: c.confianca,
        utilidade_futura: c.utilidade_futura,
      };
      const { score: salienciaScore } = calcularSaliencia(salienciaInput);

      inserirFatoLongo(
        sessao.id,
        c.conteudo,
        c.tipo,
        sensibilidade,
        c.visibilidade_uso,
        escopo,
        "inferencia_reflexao",
        undefined,
        embeddingJson,
        {
          origem: "reflexao",
          status,
          confianca: c.confianca,
          saliencia_score: salienciaScore,
          utilidade_futura: c.utilidade_futura,
        }
      );

      const categoria = inferirCategoria(c.conteudo, c.tipo);
      console.log(`→ Salvo no banco (status: '${status}' · saliência: ${salienciaScore.toFixed(2)} · categoria: ${categoria}).\n`);
    } catch (e) {
      console.error("❌ Falha ao salvar o fato no banco:", e);
    }
  }

  console.log("✓ Reflexão concluída.");
}

main().catch(err => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
