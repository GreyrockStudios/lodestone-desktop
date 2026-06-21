import { create } from 'zustand'

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
  
  // Memory stats
  memoryCount: number
  wikiCount: number
  setMemoryStats: (mem: number, wiki: number) => void
}

export interface AgentConfig {
  agentName: string
  personality: string
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
  
  activeView: 'chat',
  setActiveView: (v) => set({ activeView: v }),
  
  config: null,
  setConfig: (c) => set({ config: c }),
  
  messages: [],
  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  clearMessages: () => set({ messages: [] }),
  
  memoryCount: 0,
  wikiCount: 0,
  setMemoryStats: (mem, wiki) => set({ memoryCount: mem, wikiCount: wiki }),
}))