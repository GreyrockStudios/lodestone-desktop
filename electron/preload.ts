import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Config
  loadConfig: () => ipcRenderer.invoke('config:load'),
  saveConfig: (config: any) => ipcRenderer.invoke('config:save', config),
  hasCompletedWizard: () => ipcRenderer.invoke('config:hasWizard'),
  
  // Engine
  startEngine: (config: any) => ipcRenderer.invoke('engine:start', config),
  stopEngine: () => ipcRenderer.invoke('engine:stop'),
  engineStatus: () => ipcRenderer.invoke('engine:status'),
  
  // Workspace
  workspacePath: () => ipcRenderer.invoke('workspace:path'),
  openInFinder: () => ipcRenderer.invoke('workspace:openInFinder'),
  
  // App
  appVersion: () => ipcRenderer.invoke('app:version'),
  
  // Brain
  scanBrain: () => ipcRenderer.invoke('brain:scan'),
  
  // Events
  onEngineCrashed: (callback: (data: any) => void) => {
    ipcRenderer.on('lodestone:crashed', (_, data) => callback(data))
  }
}

contextBridge.exposeInMainWorld('lodestone', api)