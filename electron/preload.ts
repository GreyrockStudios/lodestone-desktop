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
  
  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateAvailable: (callback: (info: { version: string; releaseDate: string }) => void) =>
    ipcRenderer.on('update:available', (_e: any, info: any) => callback(info)),
  onUpdateProgress: (callback: (progress: { percent: number; transferred: number; total: number; speed: number }) => void) =>
    ipcRenderer.on('update:progress', (_e: any, progress: any) => callback(progress)),
  onUpdateDownloaded: (callback: (info: { version: string }) => void) =>
    ipcRenderer.on('update:downloaded', (_e: any, info: any) => callback(info)),
  
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
  
  // Crash Reporter
  writeCrashLog: (message: string) => ipcRenderer.invoke('crash:writeLog', message),
  
  // External links
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  
  // Tray navigation events
  onNavigate: (callback: (view: string) => void) => {
    ipcRenderer.on('app:navigate', (_, view) => callback(view))
  },

  // Host Control
  execCommand: (command: string, cwd?: string, timeoutMs?: number) => ipcRenderer.invoke('host:exec', command, cwd, timeoutMs),
  listFiles: (dirPath: string) => ipcRenderer.invoke('host:listFiles', dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke('host:readFile', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('host:writeFile', filePath, content),
  deleteFile: (filePath: string) => ipcRenderer.invoke('host:deleteFile', filePath),
  moveFile: (src: string, dest: string) => ipcRenderer.invoke('host:moveFile', src, dest),
  makeDir: (dirPath: string) => ipcRenderer.invoke('host:makeDir', dirPath),
  getSystemInfo: () => ipcRenderer.invoke('host:systemInfo'),
  getProcessList: () => ipcRenderer.invoke('host:processList'),
  killProcess: (pid: number) => ipcRenderer.invoke('host:killProcess', pid),
  openTerminal: (command?: string) => ipcRenderer.invoke('host:openTerminal', command),
  revealFile: (filePath: string) => ipcRenderer.invoke('host:revealFile', filePath),
  getDiskUsage: (dirPath: string) => ipcRenderer.invoke('host:diskUsage', dirPath),

  // File Watcher
  watchPath: (dirPath: string) => ipcRenderer.invoke('host:watchPath', dirPath),
  unwatchPath: (dirPath: string) => ipcRenderer.invoke('host:unwatchPath', dirPath),
  onFileEvent: (callback: (data: { path: string; event: string }) => void) => {
    const handler = (_: any, data: { path: string; event: string }) => callback(data)
    ipcRenderer.on('host:fileEvent', handler)
    return () => { ipcRenderer.removeListener('host:fileEvent', handler) }
  },
}

contextBridge.exposeInMainWorld('lodestone', api)