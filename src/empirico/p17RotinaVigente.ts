import "../carregarEnv.js";
import { randomUUID } from "node:crypto";
import { blocosDaRotinaVigente, hojeISOnoFuso, type BlocoRotinaCore, type RotinaSetCore } from "../estado/neuronioRotina.js";
import { executarPipelineCompleto } from "../pipeline/executarPipelineCompleto.js";

const V="\x1b[32m",R="\x1b[31m",C="\x1b[90m",B="\x1b[1m",A="\x1b[33m",X="\x1b[0m";
const config={apiKey:process.env.OPENROUTER_API_KEY!,baseUrl:"https://openrouter.ai/api/v1",modeloMenor:"deepseek/deepseek-v4-flash",modeloMaior:"deepseek/deepseek-v4-pro",temperaturaMenor:0,temperaturaMaior:1};

const hoje = hojeISOnoFuso("America/Sao_Paulo");
const d = new Date(); const ate = new Date(d); ate.setDate(d.getDate()+5);
const ateISO = `${ate.getFullYear()}-${String(ate.getMonth()+1).padStart(2,"0")}-${String(ate.getDate()).padStart(2,"0")}`;

// Normal: trabalho. Férias (vigora hoje): praia.
const todos: BlocoRotinaCore[] = [
  { id:"trab", titulo:"Trabalho", dias:[0,1,2,3,4,5,6], inicio:540, fim:1020, origem:"ethan" },
  { id:"praia", titulo:"Praia", dias:[0,1,2,3,4,5,6], inicio:600, fim:720, origem:"ethan", setId:"ferias" },
];
const sets: RotinaSetCore[] = [{ id:"ferias", nome:"Férias", de:hoje, ate:ateISO }];

async function main(){
  console.log(`${B}╔═══ P17 · A Luna respeita as férias? ═══╗${X}`);
  const vigentes = blocosDaRotinaVigente(todos, sets, hoje);
  console.log(`${C}rotina vigente hoje: ${vigentes.map(b=>b.titulo).join(", ")}${X}\n`);

  const r = await executarPipelineCompleto("bom dia luna, como tá meu dia?", {
    sessaoId: randomUUID(), ambiente:"orbit_mobile", config, timeZone:"America/Sao_Paulo",
    interlocutor:{uid:"e",criador_verificado:true}, rotina: vigentes,
  });
  const t=(r.resposta?.texto??"").replace(/\s+/g," ");
  console.log(`${A}Ethan:${X} bom dia luna, como tá meu dia?`);
  console.log(`${C}Luna: ${t.slice(0,200)}…${X}\n`);

  const falaFerias = /praia|f[ée]rias/i.test(t);
  const falaTrabalho = /trabalho|trampo/i.test(t);
  console.log(vigentes.length===1 && vigentes[0].titulo==="Praia" ? `${V}✓ o filtro deixa só a Praia (férias)${X}` : `${R}✗ filtro errado${X}`);
  console.log(!falaTrabalho ? `${V}✓ ela NÃO cobrou o trabalho (está de férias)${X}` : `${R}✗ mencionou trabalho durante as férias${X}`);
}
main().catch(e=>{console.error(e);process.exit(1);});
