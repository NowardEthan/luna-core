import "../carregarEnv.js";
import { randomUUID } from "node:crypto";
import { executarPipelineCompleto } from "../pipeline/executarPipelineCompleto.js";
import type { BlocoRotinaCore } from "../estado/neuronioRotina.js";

const V="\x1b[32m",R="\x1b[31m",C="\x1b[90m",B="\x1b[1m",A="\x1b[33m",X="\x1b[0m";
type Bloco = BlocoRotinaCore;
const store = new Map<string, Bloco>();
store.set("trab", { id:"trab", titulo:"Trabalho", dias:[1,2,3,4,5], inicio:480, fim:1020, origem:"luna" });

const deps = {
  ler: async () => [...store.values()],
  criar: async (b:any)=>{const id=randomUUID().slice(0,6);store.set(id,{id,...b});return id;},
  editar: async (id:string,c:any)=>{const b=store.get(id);if(b)store.set(id,{...b,...c});},
  apagar: async (id:string)=>void store.delete(id),
};
const config={apiKey:process.env.OPENROUTER_API_KEY!,baseUrl:"https://openrouter.ai/api/v1",modeloMenor:"deepseek/deepseek-v4-flash",modeloMaior:"deepseek/deepseek-v4-pro",temperaturaMenor:0,temperaturaMaior:1};
const sessao=randomUUID();
const hhmm=(m:number)=>`${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;

async function turno(msg:string):Promise<string[]>{
  const fs:string[]=[];
  const r=await executarPipelineCompleto(msg,{sessaoId:sessao,ambiente:"orbit_mobile",config,timeZone:"America/Sao_Paulo",interlocutor:{uid:"e",criador_verificado:true},rotina:[...store.values()],rotinaDeps:deps as never,onAcaoAgentico:(a)=>{if(a.tipo==="inicio_ferramenta")fs.push(a.ferramenta);}});
  console.log(`${A}Ethan:${X} ${msg}`);
  console.log(`${C}  ferramentas: ${fs.join(", ")||"nenhuma"}${X}`);
  console.log(`${C}  Luna: ${(r.resposta?.texto??"").replace(/\s+/g," ").slice(0,120)}…${X}\n`);
  return fs;
}
function mostrar(){
  const t=store.get("trab")!.subtarefas??[];
  for(const s of t) console.log(`  [${s.feito?"x":" "}] ${s.texto}${s.hora!==undefined?` (${hhmm(s.hora)}${s.notificar?", cobra":""})`:""}`);
}

async function main(){
  console.log(`${B}╔═══ P15 · Sub-tarefas: aditivas, com hora que cobra ═══╗${X}\n`);

  console.log(`${B}① Adiciona várias tarefas ao Trabalho${X}`);
  await turno("no meu bloco de trabalho, adiciona: responder emails, revisar o PR do cache, e a reunião do time que é às 10h — nessa me avisa");
  mostrar();
  const t1=store.get("trab")!.subtarefas??[];
  const temReuniao=t1.find(s=>/reuni/i.test(s.texto));
  const maiuscula=t1.every(s=>/^[A-ZÀ-Ú]/.test(s.texto));
  console.log(t1.length>=3?`${V}✓ criou ${t1.length}${X}`:`${R}✗ só ${t1.length}${X}`);
  console.log(maiuscula?`${V}✓ formato de tarefa (maiúscula)${X}`:`${R}✗ minúsculas/conversa${X}`);
  console.log(temReuniao?.notificar?`${V}✓ a reunião das 10h vai cobrar${X}\n`:`${R}✗ reunião sem cobrança${X}\n`);

  console.log(`${B}② ADITIVO: «inclui mais uma» não apaga as outras${X}`);
  const antes=(store.get("trab")!.subtarefas??[]).length;
  await turno("inclui mais uma: atualizar a documentação");
  const depois=(store.get("trab")!.subtarefas??[]).length;
  mostrar();
  console.log(depois===antes+1?`${V}✓ aditivo (${antes} → ${depois}, nada apagado)${X}\n`:`${R}✗ ${antes} → ${depois}${X}\n`);
}
main().catch(e=>{console.error(e);process.exit(1);});
