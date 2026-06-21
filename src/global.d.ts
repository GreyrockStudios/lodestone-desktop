/// <reference types="vite/client" />

interface LodestoneAPI {
  loadConfig: () => Promise<AgentConfig | null>
  saveConfig: (config: AgentConfig) => Promise<boolean>
  hasCompletedWizard: () => Promise<boolean>
  revealConfigFile: () => Promise<boolean>
  resetAgent: () => Promise<boolean>

  // Engine
  startEngine: (config: AgentConfig) => Promise<{ success: boolean; port: number; error?: string }>
  stopEngine: () => Promise<boolean>
  engineStatus: () => Promise<{ running: boolean; port: number }>
  engineUptime: () => Promise<number>

  // Workspace
  workspacePath: () => Promise<string>
  openInFinder: () => Promise<boolean>
  exportAllData: () => Promise<string | null>

  // LLM
  testConnection: (provider: string, apiKey: string, model: string, endpoint?: string) => Promise<{ success: boolean; message: string }>

  // App
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

  // Crash Reporter
  writeCrashLog: (message: string) => Promise<boolean>

  // External links
  openExternal: (url: string) => Promise<boolean>

  // Tray navigation
  onNavigate: (callback: (view: string) => void) => void

  // Host Control
  execCommand: (command: string, cwd?: string, timeoutMs?: number) => Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number | null }>
  listFiles: (dirPath: string) => Promise<{ success: boolean; files: FileEntry[]; error?: string }>
  readFile: (filePath: string) => Promise<{ success: boolean; content: string; error?: string }>
  writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
  moveFile: (src: string, dest: string) => Promise<{ success: boolean; error?: string }>
  makeDir: (dirPath: string) => Promise<{ success: boolean; error?: string }>
  getSystemInfo: () => Promise<{ platform: string; arch: string; hostname: string; uptime: number; loadAvg: number[]; totalMem: number; freeMem: number; cpus: number; nodeVersion: string }>
  getProcessList: () => Promise<{ success: boolean; processes: ProcessInfo[]; error?: string }>
  killProcess: (pid: number) => Promise<{ success: boolean; error?: string }>
  openTerminal: (command?: string) => Promise<{ success: boolean; error?: string }>
  revealFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
  getDiskUsage: (dirPath: string) => Promise<{ success: boolean; size: number; fileCount: number; error?: string }>

  // File Watcher
  watchPath: (dirPath: string) => Promise<{ success: boolean; error?: string }>
  unwatchPath: (dirPath: string) => Promise<{ success: boolean; error?: string }>
  onFileEvent: (callback: (data: { path: string; event: string }) => void) => (() => void)
}

interface FileEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  modified: string
  extension?: string
}

interface ProcessInfo {
  pid: number
  name: string
  cpu: number
  memory: number
}

interface AgentConfig {
  agentName: string
  personality: string
  apiKey: string
  model: string
  endpoint?: string
  llmProvider: string
}

interface Window {
  lodestone: LodestoneAPI
}