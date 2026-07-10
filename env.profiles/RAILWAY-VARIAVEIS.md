# Railway — variáveis do serviço `luna-core`

Copia estes pares **nome = valor** no painel **Variables** do Railway.  
Segredos (`csk_…`, `gsk_…`) cola os teus — não commits no git.

## Cerebras — cérebro do chat (obrigatório)

| Variável | Valor |
|----------|-------|
| `CEREBRAS_API_KEY` | `csk_…` (https://cloud.cerebras.ai) |
| `CEREBRAS_API_BASE` | `https://api.cerebras.ai/v1` |
| `CEREBRAS_MODEL` | `zai-glm-4.7` |
| `CEREBRAS_TEMPERATURA` | `1` |
| `CEREBRAS_REASONING_EFFORT` | `low` (mobile) ou `medium` |
| `LUNA_LLM_TIMEOUT_MS` | `120000` (escada de timeout — deixa v4-pro caber sem streaming) |
| `LUNA_CHAT_TIMEOUT_MS` | `150000` (servidor sem streaming — precisa ser > LLM) |
| `LUNA_STREAM_TIMEOUT_MS` | `180000` (streaming SSE — o mais folgado; era 120s hardcoded) |
| `LUNA_EMBEDDINGS` | `0` (opcional — mobile já ignora embeddings) |
| `CEREBRAS_GZIP_MIN_BYTES` | `8192` |
| `LUNA_STREAM_ENABLED` | `1` |

Com `CEREBRAS_API_KEY` preenchida, **todo o chat** (resposta, neurônios, intenção) usa GLM. Groq **não** entra no texto.

## Groq — só voz e imagem

| Variável | Valor |
|----------|-------|
| `LUNA_API_KEY` | `gsk_…` (fallback STT/visão) |
| `LUNA_STT_API_KEY` | `gsk_…` (mesma chave — só transcrição de voz) |
| `LUNA_VISION_API_KEY` | `gsk_…` (mesma chave — só descrição de imagem) |
| `LUNA_API_BASE` | `https://api.groq.com/openai/v1` |
| `LUNA_MODELO_MENOR` | `llama-3.1-8b-instant` |
| `LUNA_MODELO_MAIOR` | `openai/gpt-oss-120b` |
| `LUNA_TEMPERATURA_MAIOR` | `0.85` |
| `LUNA_API_PAUSA_MS` | `2500` |

**Não defines** `LUNA_GROQ_CHAT` (ou deixa ausente). Só com `LUNA_GROQ_CHAT=1` o Groq volta ao chat.

## Firebase + persistência

| Variável | Valor |
|----------|-------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | JSON completo numa linha |
| `LUNA_FIREBASE_AUTH_REQUIRED` | `true` |
| `LUNA_STORE` | `firestore` |
| `LUNA_CRIADOR_UID` | UID Firebase do Ethan (acesso Core no plano free) |

## Asaas (billing)

| Variável | Valor |
|----------|-------|
| `ASAAS_ENV` | `production` ou `sandbox` |
| `ASAAS_API_KEY` | chave Asaas |
| `ASAAS_WEBHOOK_TOKEN` | token do webhook |

## Opcional

| Variável | Valor |
|----------|-------|
| `LUNA_AGENTIC_VISION` | `0` (default) ou `1` — ferramenta de imagem no agente |
| `LUNA_STT_MODEL` | `whisper-large-v3-turbo` |
| `LUNA_STT_PROMPT` | `Mensagem de voz em português do Brasil.` |

## Apagar no Railway (legado, não usa)

- `OPENROUTER_API_KEY`
- `OPENROUTER_APP_TITLE`
- `OPENROUTER_HTTP_REFERER`

## Verificar depois do deploy

1. `GET https://SEU-SERVICO.up.railway.app/health`
2. Confirma `llmProviders` com entrada `cerebras` / `glm-47`
3. Confirma `streamSupported: true`
4. Envia mensagem no app — resposta não deve dar erro de rate limit Groq no **texto**

Se o limite Groq aparecer **só com voz ou foto**, é quota STT/visão (esperado).
