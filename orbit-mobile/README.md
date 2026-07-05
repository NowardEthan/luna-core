# Orbit Mobile

App **React Native (Expo)** da Luna — chat, voz, anexos, billing e sync Firestore.

> **Repositório canónico:** este código vive em [`luna-core/orbit-mobile/`](../) — [github.com/NowardEthan/luna-core](https://github.com/NowardEthan/luna-core). Não uses um repo Git separado para o mobile.

## Requisitos

- Node.js 20+
- Expo CLI / `npx expo`
- Android Studio ou dispositivo físico (testes principais em Android)
- Luna Mobile API a correr (local ou Railway)

## Configuração

```bash
cd orbit-mobile
npm install
cp .env.example .env   # URL da API, Firebase, etc.
```

Variável principal: URL da Luna Mobile API (ex. `https://seu-servico.up.railway.app`).

## Desenvolvimento

```bash
npx expo start
# ou build APK:
# pwsh scripts/build-android-apk.ps1
```

## Funcionalidades

- Chat com **streaming SSE** (Cerebras GLM 4.7) — reveal por palavra + faixa de raciocínio live
- Fallback JSON automático (Groq / erro de stream)
- Multi-provider: Groq, Cerebras, Auto
- Voz (STT via API), visão, documentos
- Firebase Auth + Firestore (conversas, perfil)
- Planos e quotas (Asaas via API)

Documentação completa: [README.md](../README.md) na raiz do monorepo.
