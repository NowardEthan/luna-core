# Luna Core — v0.1.0 (tag) · V1.1 no código

> **A LLM grande é a voz. Os modelos menores são os neurônios. O Core orquestra.**

**Repo:** [github.com/NowardEthan/luna-core](https://github.com/NowardEthan/luna-core) (privado)

## Status

| Fase | Status |
|---|---|
| V0 — Core mínimo | ✅ completo (tag `v0.1.0`) |
| **V1.2 — Neurônio de memória** | **✅ completo** |
| V1.3 — Memória longa | 🔵 próximo |

| Fase | Entregável |
|---|---|
| V0.1–V0.5 | Constituição, pipeline, LLM, validação, riscos |
| V1.1 | Sessões JSON, histórico, `--continuar` |
| **V1.2** | Neurônio memória, `confirmar` sensível, `npm run memoria` |

## Comandos

```bash
npm install
npm test                     # 59 testes

# Neurônio de memória (V1.2)
npm run memoria -- --regras "Eu sou autista"
npm run memoria -- "Eu sou autista"          # com LLM

# Chat
npm run chat -- "sua mensagem"
npm run chat -- --continuar "continua a última sessão"
npm run chat -- --sessao UUID-AQUI "mensagem em sessão específica"
npm run chat                 # ajuda + mostra última sessão

# Debug / validação V0
npm run policy -- "mensagem"
npm run analisar -- "mensagem"
npm run validar:v0
npm run validar:v0 -- --ab
```

## V1.1 — Memória curta de sessão

### O que faz

- Cada `npm run chat` cria ou continua uma **sessão** (`logs/sessoes/<uuid>.json`).
- Persiste **mensagens** (histórico), **fatos** (quando política `acao_memoria=armazenar`) e **preferências**.
- O respondedor recebe histórico + bloco de contexto — Luna usa continuidade **dentro da sessão**.
- `.ultima-sessao` permite `--continuar` sem copiar UUID.

### Uso no PowerShell

```powershell
cd src/luna-core

# 1ª mensagem — anote o ID no bloco final (ou use --continuar depois)
npm run chat -- "Eu sou autista"

# Continuar (recomendado)
npm run chat -- --continuar "Lembra do que eu te disse?"

# Com UUID explícito — SEM < > (PowerShell interpreta como operador)
npm run chat -- --sessao 448d36dd-6f2a-40a0-a782-2a020662e7cd "..."
```

### Validado manualmente (2026-05-31)

| Passo | Resultado |
|---|---|
| `"Eu sou autista"` | Sessão criada, resposta acolhedora |
| `--continuar "Lembra do que eu te disse?"` | Recall correto: *"lembro que você compartilhou que é autista"* |

### Módulos

```
src/memoria/
  esquemaMemoria.ts      # MemoriaSessao
  storeSessao.ts         # logs/sessoes/*.json
  gerenciadorSessao.ts   # turnos, fatos, limite 20 msgs
  formatarContextoSessao.ts
src/analyzers/lexicoMemoria.ts  # recall ≠ identidade
```

## Validação V0.4

10 cenários em `tests/cenarios-v0.json` · relatórios em `logs/validacao-v0/`.

Comparativo A/B: prompt monolítico vs Core + política (mesmo modelo Groq).

## V1.2 — Neurônio de memória

O modelo menor decide `armazenar` / `confirmar` / `ignorar` antes de gravar fatos.

```powershell
npm run chat -- "Eu sou autista"
# → Luna pergunta se pode lembrar · pendente_confirmacao · 0 fatos

npm run chat -- --continuar "Sim, pode lembrar"
# → fato confirmado gravado
```

## Próximo: V1.3 — Memória longa
