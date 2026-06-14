import { obterEstado, entrar, sair, iniciarTransicao } from "../presenca/gerenciadorPresenca.js";
import { avaliarPresenca } from "../presenca/avaliadorPresenca.js";
import { obterFila, proximaSolicitacao } from "../presenca/filaPresenca.js";

const INTERVALO_MS = 2000; // checar a cada 2 segundos

console.log("=========================================");
console.log(" Luna Core — Daemon de Presença Iniciado ");
console.log("=========================================");

let ultimaAtividade = "";
let ultimoAmbiente = "";
let tamanhoFila = -1;

setInterval(() => {
  const estado = obterEstado();
  const fila = obterFila();

  // Apenas logar se houver mudança de estado ou tamanho de fila para não sujar o terminal
  if (
    estado.atividade !== ultimaAtividade ||
    estado.ambiente !== ultimoAmbiente ||
    fila.length !== tamanhoFila
  ) {
    console.log(
      `[Daemon] Status: ${estado.status} | Ambiente: ${estado.ambiente} | Atividade: ${estado.atividade} | Fila: ${fila.length}`
    );
    ultimaAtividade = estado.atividade;
    ultimoAmbiente = estado.ambiente;
    tamanhoFila = fila.length;
  }

  // Se houver solicitações na fila
  if (fila.length > 0) {
    // Encontra a primeira urgente, senão a primeira normal
    const solicitacao = fila.find((s) => s.prioridade === "urgente") || fila[0];

    const avaliacao = avaliarPresenca(estado, {
      ambiente_solicitante: solicitacao.ambiente,
      prioridade: solicitacao.prioridade,
    });

    if (avaliacao.decisao === "transitar") {
      console.log(`[Daemon] Aceitando chamada de '${solicitacao.ambiente}'. Iniciando transição...`);
      
      // Tira da fila especificamente essa solicitação
      import("../presenca/filaPresenca.js").then(({ removerDaFila }) => {
        removerDaFila(solicitacao.id);
      });

      // Despede-se do ambiente atual (status: ausente)
      sair();
      
      // Marca transição brevemente para quem estiver ouvindo
      iniciarTransicao();

      // Entra no novo ambiente
      entrar(solicitacao.ambiente);
      
      console.log(`[Daemon] Transição concluída. Luna agora está no ambiente '${solicitacao.ambiente}'.`);
    } else if (avaliacao.decisao === "recado") {
      // Se tiver que deixar recado (ex: Luna ocupada processando),
      // tiramos a solicitação da fila (já que foi 'atendida' com um recado)?
      // Por ora, vamos apenas tirar da fila se for 'urgente' e deixar recado,
      // ou deixar lá esperando ela ficar ociosa?
      // O correto é deixar na fila para quando ela ficar ociosa poder transitar.
      // Entao nao fazemos nada, ela será atendida depois.
    }
  }
}, INTERVALO_MS);
