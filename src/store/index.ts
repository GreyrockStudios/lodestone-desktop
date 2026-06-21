import { create } from 'zustand'

export type SocketStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

interface AppState {
  // Wizard
  hasConfig: boolean
  setHasConfig: (v: boolean) => void
  
  // Engine
  engineRunning: boolean
  enginePort: number
  setEngineState: (running: boolean, port: number) => void
  
  // Active view
  activeView: string
  setActiveView: (v: string) => void
  
  // Config
  config: AgentConfig | null
  setConfig: (c: AgentConfig | null) => void
  
  // Chat
  messages: ChatMessage[]
  addMessage: (m: ChatMessage) => void
  clearMessages: () => void

  // Sending state
  sending: boolean
  setSending: (v: boolean) => void
  
  // Memory stats
  memoryCount: number
  wikiCount: number
  setMemoryStats: (mem: number, wiki: number) => void
  
  // Socket connection status
  socketStatus: SocketStatus
  setSocketStatus: (s: SocketStatus) => void

  // Token counts
  inputTokens: number
  totalTokens: number
  setInputTokens: (n: number) => void
  setTotalTokens: (n: number) => void
  
  // Appearance
  theme: 'dark' | 'light'
  setTheme: (t: 'dark' | 'light') => void
  animationsEnabled: boolean
  setAnimationsEnabled: (v: boolean) => void
  streamingEnabled: boolean
  setStreamingEnabled: (v: boolean) => void
}

export interface AgentConfig {
  agentName: string
  personality: string
  agentEmoji?: string
  llmProvider: string
  apiKey: string
  model: string
  endpoint?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  tools?: string[]
}

export const useStore = create<AppState>((set) => ({
  hasConfig: false,
  setHasConfig: (v) => set({ hasConfig: v }),
  
  engineRunning: false,
  enginePort: 0,
  setEngineState: (running, port) => set({ engineRunning: running, enginePort: port }),
  
  activeView: 'dashboard',
  setActiveView: (v) => set({ activeView: v }),
  
  config: null,
  setConfig: (c) => set({ config: c }),
  
  messages: [],
  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  clearMessages: () => set({ messages: [] }),

  sending: false,
  setSending: (v) => set({ sending: v }),
  
  memoryCount: 0,
  wikiCount: 0,
  setMemoryStats: (mem, wiki) => set({ memoryCount: mem, wikiCount: wiki }),
  
  socketStatus: 'disconnected',
  setSocketStatus: (s) => set({ socketStatus: s }),

  inputTokens: 0,
  totalTokens: 0,
  setInputTokens: (n) => set({ inputTokens: n }),
  setTotalTokens: (n) => set({ totalTokens: n }),
  
  theme: 'dark',
  setTheme: (t) => set({ theme: t }),
  animationsEnabled: true,
  setAnimationsEnabled: (v) => set({ animationsEnabled: v }),
  streamingEnabled: true,
  setStreamingEnabled: (v) => set({ streamingEnabled: v }),
}))