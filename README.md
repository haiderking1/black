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
