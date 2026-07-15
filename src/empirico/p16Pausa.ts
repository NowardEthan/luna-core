import "../carregarEnv.js";
import { randomUUID } from "node:crypto";
import { executarPipelineCompleto } from "../pipeline/executarPipelineCompleto.js";
import { estaPausado, hojeISOnoFuso, type BlocoRotinaCore } from "../estado/neuronioRotina.js";

const V="\x1b[32m",R="\x1b[31m",C="\x1b[90m",B="\x1b[1m",A="\x1b[33m",X="\x1b[0m";
const config={apiKey:process.env.OPENROUTER_API_KEY!,baseUrl:"https://openrouter.ai/api/v1",modeloMenor:"deepseek/deepseek-v4-flash",modeloMaior:"deepseek/deepseek-v4-pro",temperaturaMenor:0,temperaturaMaior:1};

// Data claramente no futuro (2 meses à frente), para o teste não depender do mês de hoje.
const futuro=new Date(); futuro.setMonth(futuro.getMonth()+2);
const ateISO=`${futuro.getFullYear()}-${String(futuro.getMonth()+1).padStart(2,"0")}-${String(futuro.getDate()).padStart(2,"0")}`;

async function umaCorrida(): Promise<{chamou:boolean;pausou:boolean}>{
  const store=new Map<string,BlocoRotinaCore>();
  store.set("curso",{id:"curso",titulo:"Curso de inglês",dias:[6],inicio:540,fim:660,origem:"ethan"});
  const deps={ler:async()=>[...store.values()],criar:async(b:any)=>{const id=randomUUID().slice(0,6);store.set(id,{id,...b});return id;},editar:async(id:string,c:any)=>{const b=store.get(id);if(b)store.set(id,{...b,...c,...(c.pausa===null?{pausa:undefined}:{})});},apagar:async(id:string)=>void store.delete(id)};
  const fs:string[]=[];
  await executarPipelineCompleto(`o meu curso de inglês pegou férias, pausa ele até ${ateISO}`,{sessaoId:randomUUID(),ambiente:"orbit_mobile",config,timeZone:"America/Sao_Paulo",interlocutor:{uid:"e",criador_verificado:true},rotina:[...store.values()],rotinaDeps:deps as never,onAcaoAgentico:(a)=>{if(a.tipo==="inicio_ferramenta")fs.push(a.ferramenta);}});
  const p=store.get("curso")!.pausa;
  return { chamou: fs.includes("pausar_bloco"), pausou: !!(p?.ate && estaPausado(p,hojeISOnoFuso("America/Sao_Paulo"))) };
}

async function main(){
  console.log(`${B}╔═══ P16 · Pausa é confiável? (${ateISO}) ═══╗${X}\n`);
  const N=4; let chamou=0, pausou=0;
  for(let i=1;i<=N;i++){
    const r=await umaCorrida();
    if(r.chamou)chamou++; if(r.pausou)pausou++;
    console.log(`  ${i}. chamou pausar_bloco: ${r.chamou?V+"✓":R+"✗ (confabulou)"}${X}  ·  pausou de fato: ${r.pausou?V+"✓":R+"✗"}${X}`);
  }
  console.log(`\n${B}chamou a ferramenta: ${chamou}/${N}  ·  pausou de fato: ${pausou}/${N}${X}`);
  console.log(pausou===N?`${V}${B}✓ confiável${X}`:`${R}${B}✗ intermitente — precisa de guarda${X}`);
}
main().catch(e=>{console.error(e);process.exit(1);});
