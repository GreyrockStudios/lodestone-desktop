# Lodestone Desktop

**AI agent for everyone. No terminal. No Docker. No Node.js.**

Download, install, paste your API key, chat.

## What it is

Lodestone Desktop wraps the [Lodestone](https://github.com/GreyrockStudios/lodestone) agent engine in a desktop app. You get:

- 🧠 **Memory** — Your agent remembers across conversations
- 🔧 **39 built-in tools** — Web search, file ops, code execution, scheduling, and more
- 🪪 **Identity** — Name your agent, give it a personality
- 📅 **Scheduler** — Cron-style jobs for recurring tasks
- 🔄 **Self-improving** — Learns from mistakes, gets better over time

## First-run wizard

1. Name your agent
2. Pick a personality (or write your own)
3. Paste your API key (OpenAI, Anthropic, Ollama Cloud, Groq, OpenRouter, or any OpenAI-compatible endpoint)
4. Pick a model
5. Start chatting

That's it. No config files, no YAML, no command line.

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

## Pricing

- **Free** — Local use, BYO API key, all 39 tools, memory, identity, scheduler
- **Pro $197** — Cloud sync, advanced tools, priority support *(coming soon)*
- **Enterprise $997** — Team agents, shared memory, SLA *(coming soon)*

Like Obsidian — local-first, free core, paid sync.

## Tech stack

- Electron 35
- React 19 + Vite 6
- Tailwind CSS v4
- Framer Motion
- TypeScript
- Socket.IO (engine communication)

## Build from source

```bash
git clone https://github.com/GreyrockStudios/lodestone-desktop.git
cd lodestone-desktop
npm install
npm run dev    # development
npm run build  # production build
npm run dist   # package for distribution (.dmg / .exe / .AppImage)
```

## License

MIT — same as Lodestone.

## Links

- [Lodestone engine](https://github.com/GreyrockStudios/lodestone)
- [Marketing site](https://lodestone.greyrockstudios.com)
- [Documentation](https://github.com/GreyrockStudios/lodestone#readme)