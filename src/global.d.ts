/// <reference types="vite/client" />

interface LodestoneAPI {
  loadConfig: () => Promise<AgentConfig | null>
  saveConfig: (config: AgentConfig) => Promise<boolean>
  hasCompletedWizard: () => Promise<boolean>
  startEngine: (config: AgentConfig) => Promise<{ success: boolean; port: number; error?: string }>
  stopEngine: () => Promise<boolean>
  engineStatus: () => Promise<{ running: boolean; port: number }>
  workspacePath: () => Promise<string>
  openInFinder: () => Promise<boolean>
  appVersion: () => Promise<string>
  scanBrain: () => Promise<{ nodes: any[]; stats: any }>
  dashboardStats: () => Promise<any>
  updateSafety: (settings: any) => Promise<boolean>
  getNearMisses: () => Promise<any[]>
  getConstraints: () => Promise<any[]>
  listHistory: () => Promise<any[]>
  getHistory: (sessionId: string) => Promise<any | null>
  exportHistory: (sessionId: string) => Promise<string | null>
  onEngineCrashed: (callback: (data: { code: number }) => void) => void
}

interface AgentConfig {
  agentName: string
  personality: string
  llmProvider: string
  apiKey: string
  model: string
  endpoint?: string
}

interface Window {
  lodestone: LodestoneAPI
}