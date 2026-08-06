# Diretrizes do luna-core — leia antes de mexer

> Para qualquer agente de IA ou pessoa. Escreva tudo (código, comentários) em **pt-BR** (nunca
> pt-PT). **O guia completo do ecossistema Orbit está em `orbit-mobile/AGENTS.md`** — leia-o; aqui
> ficam só as regras específicas deste servidor.

## O que é
O **luna-core** é o servidor da Luna (Node/TS). A pasta `mobile-api/` expõe as rotas que o app
Orbit consome (chat, transcrição de voz, billing, apagar conta…). O «cérebro» da Luna e as
ferramentas dela ficam em `src/`.

## 🛑 Regras que evitam estrago

1. **Railway faz auto-deploy do `main`.** Trabalhe no `dev`; promova pro `main` só quando validar.
   Pode empurrar direto quando fizer sentido — mas **sempre confirme o SHA no `/health`** depois
   (o campo `commit`). Nunca confie em `ok: true` (só prova que *algum* deploy está de pé).

2. **Nunca exponha segredo.** Chaves de IA/LLM/STT vivem no `.env` (local) e nas **variáveis do
   Railway** — nunca em código, log ou resposta. Se precisar rotacionar uma chave, é operação do
   Ethan no console do provedor + atualizar o Railway.

3. **Auth de verdade.** Toda rota que toca dado do usuário **verifica o Firebase ID token**
   (`verifyIdToken` / `verifyFirebaseBearer`) — **não** confie no `uid` que o app manda. Confiar =
   alguém se passa por outro.

4. **Firestore com `firebase-admin`** (ignora as regras — o app é que lê com as regras, por dono).
   Dados do usuário vivem em `users/{uid}/…` (conversas+mensagens, rotina, memória, luz). O mundo
   interior da Luna é **global** (`luna_mundo/…`) e **não** é dado pessoal do usuário — não apague
   no «apagar conta» (que varre só `users/{uid}` + o login no Auth).

5. **Marcadores no `/health`.** Ao entregar uma feature verificável, adicione um marcador booleano
   em `features` (e um no schema `HealthResponse`) pra dar pra confirmar o deploy pelo SHA + o
   marcador. Cada linha ali é uma afirmação verificável sobre ESTE binário.

## Convenções
- **pt-BR sempre.** A voz da Luna e os comentários seguem o mesmo idioma.
- As sessões de chat `rotina-<blocoId>` e `rotina-geral` são conversas de rotina (o app as esconde
  do histórico). A ferramenta `buscar_na_conversa` existe mas a UI dela no app foi revertida — ver
  a branch `antigravity-search` no orbit-mobile antes de reativar.
- Antes de promover pro `main`: `npm run check` (typecheck) limpo e `npm run build` (o Dockerfile
  do Railway builda do source).

_Na dúvida sobre deploy, dados ou auth: pergunte antes. O guia completo está em
`orbit-mobile/AGENTS.md`._

## Cursor Cloud specific instructions

Ambiente já tem as dependências instaladas (update script roda `npm install` na raiz e em
`mobile-api/`). Node ≥ 20. Comandos padrão estão no `README.md` e nos `scripts` do `package.json`.

- **`dist/` é obrigatório para a mobile-api e é gitignored.** `mobile-api/src/loadCore.ts` importa
  de `../../dist/...`, então rode `npm run build` (na raiz) **antes** de `npm run mobile-api:dev`
  (porta 7742). O Core em si (CLI, testes via `tsx`/`vitest`) não precisa de build.
- **Sem chaves de API neste ambiente por padrão.** `/health` mostra `llmConfigured:false`,
  `visionConfigured:false`, `firebaseConfigured:false`. Chat, visão e STT ao vivo exigem segredos
  (`LUNA_API_KEY`/Groq, `OPENROUTER_API_KEY`, `CEREBRAS_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`) —
  adicione-os em Secrets para testar contra modelos reais. Sem eles, os endpoints respondem com erro
  claro (ex.: "Nenhum provedor de LLM configurado"), mas o servidor sobe normalmente.
- **Testar o caminho de visão/agêntico offline:** injete um `ProvedorAgente` mock e
  `visaoDeps.descreverImagem` — nenhuma rede é tocada. Ver `tests/agenticoChat.test.ts` como
  molde. Duas camadas de visão coexistem: a agêntica (`ver_imagem` → `src/agentico/especialistas/
  visaoGemma.ts` → OpenRouter) usada no chat mobile, e o endpoint legado `/v1/vision`
  (`mobile-api/src/describeVision.ts` → Groq). Quando a visão não vê, o código força honestidade
  (nada de adivinhar) — confabulação de leitura vem do MODELO de visão, não do pipeline.
- **`npm test` (vitest): 3 arquivos falham sempre aqui** porque importam de `../../../orbit-mobile`
  (repo separado, não versionado neste monorepo): `quotaMerge`, `rosaryLogic`, `rosaryJournalUtils`.
  É esperado sem o repo irmão ao lado. As suítes do Core passam.
