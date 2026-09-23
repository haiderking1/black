# black

Electron desktop client for a **local coding agent** — chat UI, tool calls, workspace focus, and settings in a native window.

Built with **TypeScript**, **React**, **Electron**, and **electron-vite**. Package manager is **Bun**.

## Stack

- Electron + electron-vite
- React 19 UI (chat, composer, sidebar, markdown, tools)
- Effect / TypeBox on the backend side of the app
- Bun for install, scripts, and tests

## Setup

```bash
bun install
bun run dev
```

## Experiential Labs

In Settings → Providers, choose Experiential Labs and paste an organization API key from [the Experiential dashboard](https://platform.experientiallabs.ai/settings/api-keys). Black stores the key in its local agent directory, not in the project. Alternatively, export `EXPLABS_API_KEY` before starting Black. Then choose Experiential Labs and a model in the composer.

Black lists models your key can call from `/v1/models` and reads their context, image, tool, and reasoning support from the Experiential catalog. Jev decision models do not appear in chat because they use `/v1/systemone`, not Chat Completions. No provider key is needed to build or run tests; live inference needs your own key and account access.

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Dev app with watch |
| `bun run build` | Production build |
| `bun run preview` | Preview built app |
| `bun test` | Run tests |

## Layout

```text
frontend/   React UI (chat, composer, tools, settings, …)
backend/    Electron / Node side
contracts/  Shared contracts between UI and backend
tests/      Bun tests
```

## License

MIT — see `LICENSE` and `NOTICE`.
