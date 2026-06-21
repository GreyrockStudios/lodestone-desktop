import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Config
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (config: any) => ipcRenderer.invoke('config:save', config),
  hasCompletedWizard: () => ipcRenderer.invoke('config:hasWizard'),
  revealConfigFile: () => ipcRenderer.invoke('config:revealFile'),
  resetAgent: () => ipcRenderer.invoke('config:reset'),
  
  // Engine
  startEngine: (config: any) => ipcRenderer.invoke('engine:start', config),
  stopEngine: () => ipcRenderer.invoke('engine:stop'),
  engineStatus: () => ipcRenderer.invoke('engine:status'),
  engineUptime: () => ipcRenderer.invoke('engine:uptime'),
  
  // Workspace
  workspacePath: () => ipcRenderer.invoke('workspace:path'),
  openInFinder: () => ipcRenderer.invoke('workspace:openInFinder'),
  exportAllData: () => ipcRenderer.invoke('workspace:exportAll'),
  
  // LLM
  testConnection: (provider: string, apiKey: string, model: string, endpoint?: string) =>
    ipcRenderer.invoke('llm:testConnection', provider, apiKey, model, endpoint),
  
  // App
  appVersion: () => ipcRenderer.invoke('app:version'),
  
  // Brain
  scanBrain: () => ipcRenderer.invoke('brain:scan'),
  
  // Dashboard
  dashboardStats: () => ipcRenderer.invoke('dashboard:stats'),
  
  // Safety
  updateSafety: (settings: any) => ipcRenderer.invoke('safety:update', settings),
  getNearMisses: () => ipcRenderer.invoke('safety:nearMisses'),
  getConstraints: () => ipcRenderer.invoke('safety:constraints'),
  
  // History
  listHistory: () => ipcRenderer.invoke('history:list'),
  getHistory: (sessionId: string) => ipcRenderer.invoke('history:get', sessionId),
  exportHistory: (sessionId: string) => ipcRenderer.invoke('history:export', sessionId),
  
  // Events
  onEngineCrashed: (callback: (data: any) => void) => {
    ipcRenderer.on('lodestone:crashed', (_, data) => callback(data))
  },
}

contextBridge.exposeInMainWorld('lodestone', api)