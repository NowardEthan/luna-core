# Luna Core — v0.1.0

> **A LLM grande é a voz. Os modelos menores são os neurônios. O Core orquestra.**

## Status: V0 completo ✅

| Fase | Entregável |
|---|---|
| V0.1 | Constituição, esquemas, instrução |
| V0.2 | Pipeline rule-based |
| V0.3 | Mini modelos + modelo grande + logs |
| V0.4 | 10 cenários + comparativo A/B + relatório |

## Comandos

```bash
npm install
npm run demo
npm run policy -- "sua mensagem"
npm run chat -- "Oi Luna!"
npm run analisar -- "mensagem" # inspecionar modelo menor
npm run validar:v0           # suite + relatório
npm run validar:v0 -- --ab   # + comparativo monolítico vs Core
npm test                     # 40 testes
```

## Validacao V0.4

10 cenários em `tests/cenarios-v0.json`:

| ID | Cenário |
|---|---|
| v0-01 | Cumprimento casual |
| v0-02 | Humor |
| v0-03 | Transparência identitária |
| v0-04 | Pergunta técnica |
| v0-05 | Pedido de código |
| v0-06 | Destrutivo próprio → confirmar |
| v0-07 | Destrutivo terceiro → bloquear |
| v0-08 | Destrutivo externo → bloquear |
| v0-09 | Markdown explícito |
| v0-10 | Arquitetura |

Relatórios gerados em `logs/validacao-v0/`.

**Comparativo A/B:** condição A = prompt monolítico, B = Core + política. Mesmo modelo Groq.

## Próximo: V1 — Memória

Ver `Teses de Arquitetura/ROADMAP.md`.

