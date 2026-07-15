import "../carregarEnv.js";
import { randomUUID } from "node:crypto";
import { executarPipelineCompleto } from "../pipeline/executarPipelineCompleto.js";
import type { BlocoRotinaCore } from "../estado/neuronioRotina.js";

const V="\x1b[32m",R="\x1b[31m",B="\x1b[1m",A="\x1b[33m",X="\x1b[0m";
const config={apiKey:process.env.OPENROUTER_API_KEY!,baseUrl:"https://openrouter.ai/api/v1",modeloMenor:"deepseek/deepseek-v4-flash",modeloMaior:"deepseek/deepseek-v4-pro",temperaturaMenor:0,temperaturaMaior:1};

async function corrida(pedido:string){
  const rotinas=new Map<string,any>();
  const blocos=new Map<string,any>();
  const deps={
    ler:async()=>[...blocos.values()] as BlocoRotinaCore[],
    criar:async(b:any)=>{const id=randomUUID().slice(0,6);blocos.set(id,{id,origem:"luna",...b});return id;},
    editar:async(id:string,c:any)=>{if(blocos.has(id))blocos.set(id,{...blocos.get(id),...c});},
    apagar:async(id:string)=>{blocos.delete(id);},
    lerRotinas:async()=>[...rotinas.values()],
    criarRotina:async(r:any)=>{const id=randomUUID().slice(0,6);rotinas.set(id,{id,...r});return id;},
    editarRotina:async(id:string,c:any)=>{if(rotinas.has(id))rotinas.set(id,{...rotinas.get(id),...c});},
    apagarRotina:async(id:string)=>{rotinas.delete(id);},
  };
  const fs:string[]=[];
  await executarPipelineCompleto(pedido,{
    sessaoId:randomUUID(), ambiente:"orbit_mobile", config, timeZone:"America/Sao_Paulo",
    interlocutor:{uid:"e",criador_verificado:true}, rotina:[], rotinaDeps:deps as never,
    onAcaoAgentico:(a:any)=>{if(a.tipo==="inicio_ferramenta")fs.push(a.ferramenta);},
  });
  return {rotinas:[...rotinas.values()], blocos:[...blocos.values()], fs};
}

async function main(){
  console.log(`${B}╔═══ P19 · A Luna monta uma rotina alternativa INTEIRA? ═══╗${X}\n`);

  // Buraco nº1: rótulo + blocos DENTRO dela (setId), não na Normal.
  const N=2; let inteira=0, comAlarme=0;
  for(let i=1;i<=N;i++){
    let r; try { r=await corrida("cria uma rotina de férias de 20/07 a 03/08, e põe nela um bloco de praia de manhã (8h-10h) e leitura à tarde (15h-16h) todos os dias"); } catch(e){ console.log(`  ${i}. (timeout de rede, pulei)`); continue; }
    const rot=r.rotinas[0];
    const dentro=rot? r.blocos.filter(b=>b.setId===rot.id).length : 0;
    const ok = !!rot && dentro>=1;
    if(ok)inteira++;
    console.log(`  ${i}. rotina:${rot?V+"«"+rot.nome+"»":R+"nenhuma"}${X} · blocos criados:${r.blocos.length} · DENTRO dela:${dentro>=1?V:R}${dentro}${X} ${ok?"":R+"← caiu na Normal"+X}`);
    console.log(`     ${A}fs: ${r.fs.join(", ")}${X}`);
  }

  // Alarme por conversa.
  const ra=await corrida("marca um bloco de acordar às 7h todo dia útil, e põe em modo alarme que eu não acordo sem");
  const temAlarme=ra.blocos.some(b=>b.alarme===true);
  if(temAlarme)comAlarme=1;
  console.log(`\n  alarme: bloco com alarme=true? ${temAlarme?V+"✓":R+"✗"}${X}  ${A}(fs: ${ra.fs.join(", ")})${X}`);

  console.log(`\n${B}rotina inteira: ${inteira}/${N} · alarme: ${comAlarme}/1${X}`);
  console.log(inteira===N&&comAlarme===1 ? `${V}${B}✓ buraco nº1 fechado + alarme por conversa funciona${X}` : `${A}${B}~ ver acima${X}`);
}
main().catch(e=>{console.error(e);process.exit(1);});
