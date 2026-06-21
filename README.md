# Lodestone Desktop

**Your AI agent lives on your desktop. No terminal. No Docker. No Node.js.**

Download → Install → Paste API key → Chat.

## What it does

Lodestone Desktop wraps the [Lodestone](https://github.com/GreyrockStudios/lodestone) agent engine in a desktop app. Your agent can:

- 🧠 **Remember everything** — Persistent memory across conversations
- 🔧 **Use 39 tools** — Web search, code execution, file ops, scheduling, and more
- 🪪 **Have identity** — Name it, give it a personality, make it yours
- 📅 **Schedule tasks** — Cron-style jobs for recurring work
- 🔄 **Improve itself** — Learns from mistakes, gets better over time
- 🛡️ **Stay safe** — Configurable red lines, near-miss tracking, learned constraints

## 10 views, one app

| View | What it does |
|------|-------------|
| **Dashboard** | Command center — stats, recent activity, quick actions |
| **Chat** | Talk to your agent with full markdown rendering |
| **Brain** | Knowledge graph — see your agent's mind (wiki, memories, decisions) |
| **Memory** | Browse and search stored memories + wiki pages |
| **History** | Past conversations, searchable, exportable as markdown |
| **Tools** | 39 tools, toggleable, searchable, filterable |
| **Schedule** | Cron job management |
| **Safety** | Red lines, near-misses, learned constraints, safety score |
| **Identity** | Edit agent name and personality |
| **Settings** | LLM config, workspace, engine, appearance, danger zone |

## First-run wizard

1. Name your agent
2. Pick a personality (or write your own)
3. Paste your API key
4. Pick a model
5. Start chatting

## Model-agnostic

Bring your own API key. Works with:

| Provider | Endpoint |
|----------|----------|
| OpenAI | `https://api.openai.com/v1` |
| Anthropic | `https://api.anthropic.com/v1` |
| Ollama Cloud | `https://api.litellm.ai/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Custom | Any OpenAI-compatible endpoint |

## Features

- **Command Palette** (Cmd+K) — Fuzzy search all actions
- **Keyboard shortcuts** (Cmd+1-9) — Switch views instantly
- **Status Bar** — Real-time engine status, model, memory badges
- **Welcome Tour** — 5-step onboarding for new users
- **Markdown rendering** — Code blocks, tables, lists, links in chat
- **Tray icon** — Minimize to system tray
- **Dark theme** — Easy on the eyes

## Tech stack

- Electron 35
- React 19 + Vite 6
- Tailwind CSS v4
- Framer Motion
- Zustand
- Socket.IO (engine communication)
- TypeScript (strict)

## Build from source

```bash
git clone https://github.com/GreyrockStudios/lodestone-desktop.git
cd lodestone-desktop
npm install
npm run dev    # development (hot reload)
npm run build  # production build
npm run dist   # package (.dmg / .exe / .AppImage)
```

## Pricing

- **Free** — Local use, BYO API key, all 39 tools, memory, identity, scheduler
- **Pro $197** — Cloud sync, advanced tools, priority support *(coming soon)*
- **Enterprise $997** — Team agents, shared memory, SLA *(coming soon)*

Like Obsidian — local-first, free core, paid sync.

## License

MIT — same as Lodestone.

## Links

- [Lodestone engine](https://github.com/GreyrockStudios/lodestone)
- [Marketing site](https://lodestone.greyrockstudios.com)
- [Documentation](https://github.com/GreyrockStudios/lodestone#readme)
- [Report a bug](https://github.com/GreyrockStudios/lodestone-desktop/issues)