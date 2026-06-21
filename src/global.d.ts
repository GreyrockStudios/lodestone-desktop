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