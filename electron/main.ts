import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import * as path from 'path'
import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'

// ---- Types ----
interface AgentConfig {
  agentName: string
  personality: string
  llmProvider: string
  apiKey: string
  model: string
  endpoint?: string
}

// ---- Globals ----
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let lodestoneProcess: ChildProcess | null = null
let lodestonePort = 0
let engineStartTime = 0
let isQuitting = false

// ---- Paths ----
const getAppDataPath = () => {
  const home = app.getPath('home')
  return path.join(home, '.lodestone')
}

const getConfigPath = () => path.join(getAppDataPath(), 'config.json')
const getWorkspacePath = () => path.join(getAppDataPath(), 'workspace')

// ---- Ensure app data dirs ----
function ensureDirs() {
  const dataPath = getAppDataPath()
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true })
  }
  const workspace = getWorkspacePath()
  if (!fs.existsSync(workspace)) {
    fs.mkdirSync(workspace, { recursive: true })
  }
  const wikiPath = path.join(workspace, 'wiki')
  if (!fs.existsSync(wikiPath)) {
    fs.mkdirSync(wikiPath, { recursive: true })
  }
  const memoryPath = path.join(workspace, 'memory')
  if (!fs.existsSync(memoryPath)) {
    fs.mkdirSync(memoryPath, { recursive: true })
  }
}

// ---- Config management ----
function loadConfig(): AgentConfig | null {
  const configPath = getConfigPath()
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } catch {
      return null
    }
  }
  return null
}

function saveConfig(config: AgentConfig) {
  const configPath = getConfigPath()
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

function hasCompletedWizard(): boolean {
  return loadConfig() !== null
}

// ---- Lodestone engine management ----
function getLodestoneBin(): { cmd: string; args: string[] } {
  const isDev = !app.isPackaged
  if (isDev) {
    // In dev, run the engine directly from the local lodestone project
    const engineRoot = path.resolve(__dirname, '../../engine')
    const cliEntry = path.join(engineRoot, 'packages', 'cli', 'dist', 'index.js')
    if (fs.existsSync(cliEntry)) {
      return { cmd: process.execPath, args: [cliEntry] }
    }
    // Fallback: try npx
    return { cmd: 'npx', args: ['lodestone'] }
  }
  // In production, the engine is bundled in resources/engine/
  const engineDir = path.join(process.resourcesPath, 'engine')
  const cliEntry = path.join(engineDir, 'packages', 'cli', 'dist', 'index.js')
  // Use Electron's bundled Node to run the CLI entry point
  return { cmd: process.execPath, args: [cliEntry] }
}

function startLodestone(config: AgentConfig): Promise<{ port: number }> {
  return new Promise((resolve, reject) => {
    // Generate a random port for the engine (3000-3999)
    const port = 3000 + Math.floor(Math.random() * 1000)
    lodestonePort = port

    // Write the Lodestone config YAML
    const lodestoneConfig = `agent:
  name: ${config.agentName}
  personality: ${config.personality}
  
llm:
  provider: ${config.llmProvider}
  model: ${config.model}
  apiKey: ${config.apiKey}
  ${config.endpoint ? `endpoint: ${config.endpoint}` : ''}

workspace:
  root: ${getWorkspacePath()}

channels:
  webchat:
    port: ${port}
    enabled: true

memory:
  vectorDb:
    path: ${path.join(getWorkspacePath(), 'vector.db')}
  wiki:
    path: ${path.join(getWorkspacePath(), 'wiki')}

tools:
  autoCapture: true
  enabled: all

safety:
  redLines:
    - "Never exfiltrate private data"
    - "Never run destructive commands without confirmation"
`
    const configYamlPath = path.join(getAppDataPath(), 'lodestone.config.yaml')
    fs.writeFileSync(configYamlPath, lodestoneConfig, 'utf-8')

    const { cmd, args: binArgs } = getLodestoneBin()
    const args = [...binArgs, 'start', '--config', configYamlPath]

    try {
      // Build NODE_PATH so the engine can resolve its workspace dependencies
      const engineDir = !app.isPackaged
        ? path.resolve(__dirname, '../../engine')
        : path.join(process.resourcesPath, 'engine')
      const engineNodeModules = path.join(engineDir, 'node_modules')
      const coreNodeModules = path.join(engineDir, 'packages', 'core', 'node_modules')

      lodestoneProcess = spawn(cmd, args, {
        cwd: getWorkspacePath(),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'production',
          NODE_PATH: [engineNodeModules, coreNodeModules, process.env.NODE_PATH].filter(Boolean).join(path.delimiter)
        }
      })
      engineStartTime = Date.now()

      let started = false
      const timeout = setTimeout(() => {
        if (!started) {
          reject(new Error('Lodestone engine failed to start within 30 seconds'))
          lodestoneProcess?.kill()
        }
      }, 30000)

      lodestoneProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString()
        console.log('[lodestone]', text.trim())
        if (!started && (text.includes('listening') || text.includes('started') || text.includes('ready'))) {
          started = true
          clearTimeout(timeout)
          resolve({ port })
        }
      })

      lodestoneProcess.stderr?.on('data', (data: Buffer) => {
        console.error('[lodestone:error]', data.toString().trim())
      })

      lodestoneProcess.on('exit', (code) => {
        console.log(`[lodestone] exited with code ${code}`)
        lodestoneProcess = null
        if (!isQuitting && code !== 0) {
          // Engine crashed — notify renderer
          mainWindow?.webContents.send('lodestone:crashed', { code })
        }
      })

      // If no stdout detection in 5s, just resolve with the port
      // (engine might be running but not printing the expected string)
      setTimeout(() => {
        if (!started) {
          started = true
          clearTimeout(timeout)
          resolve({ port })
        }
      }, 5000)

    } catch (err) {
      reject(err)
    }
  })
}

function stopLodestone() {
  if (lodestoneProcess) {
    lodestoneProcess.kill('SIGTERM')
    lodestoneProcess = null
  }
}

// ---- Window state persistence ----
const WINDOW_STATE_FILE = 'window-state.json'

function getWindowStatePath() {
  return path.join(getAppDataPath(), WINDOW_STATE_FILE)
}

interface WindowState {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

function loadWindowState(): WindowState | null {
  const statePath = getWindowStatePath()
  if (fs.existsSync(statePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
      if (
        typeof state.x === 'number' &&
        typeof state.y === 'number' &&
        typeof state.width === 'number' &&
        typeof state.height === 'number'
      ) {
        return state
      }
    } catch {
      // Corrupt state file — ignore
    }
  }
  return null
}

function saveWindowState(state: WindowState) {
  const statePath = getWindowStatePath()
  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8')
  } catch {
    // Can't save — ignore
  }
}

// Debounced state saver
let stateSaveTimer: ReturnType<typeof setTimeout> | null = null
function debouncedSaveState() {
  if (!mainWindow) return
  if (stateSaveTimer) clearTimeout(stateSaveTimer)
  stateSaveTimer = setTimeout(() => {
    if (!mainWindow) return
    const bounds = mainWindow.getBounds()
    saveWindowState({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: mainWindow.isMaximized(),
    })
  }, 500)
}

// ---- Window management ----
function createWindow() {
  const savedState = loadWindowState()

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: savedState?.width ?? 1200,
    height: savedState?.height ?? 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Lodestone',
    backgroundColor: '#0A0A0F',
    titleBarStyle: 'hiddenInset',
    frame: process.platform === 'win32',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  }

  // Restore position if we have saved state and it's not maximized
  if (savedState && !savedState.isMaximized) {
    windowOptions.x = savedState.x
    windowOptions.y = savedState.y
  }

  mainWindow = new BrowserWindow(windowOptions)

  // Restore maximized state if needed
  if (savedState?.isMaximized) {
    mainWindow.maximize()
  }

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  // Save window state on resize/move (debounced)
  mainWindow.on('resize', debouncedSaveState)
  mainWindow.on('move', debouncedSaveState)
  mainWindow.on('maximize', debouncedSaveState)
  mainWindow.on('unmaximize', debouncedSaveState)

  // Minimize to tray on close
  let hasShownTrayNotification = false
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
      // Show notification on first minimize-to-tray
      if (!hasShownTrayNotification) {
        hasShownTrayNotification = true
        const config = loadConfig()
        const agentName = config?.agentName || 'Lodestone'
        if (tray) {
          tray.displayBalloon({
            iconType: 'info',
            title: `${agentName}`,
            content: 'Lodestone is still running in the background',
          })
        }
      }
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray() {
  // Create tray icon
  const iconPath = path.join(__dirname, '..', 'build', 'tray-icon.png')
  let icon = nativeImage.createEmpty()
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath)
  }
  tray = new Tray(icon)
  
  const config = loadConfig()
  const agentName = config?.agentName || 'Lodestone'
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Window', click: () => {
      mainWindow?.show()
      mainWindow?.focus()
    }},
    { type: 'separator' },
    { 
      label: `Agent: ${agentName}`, 
      enabled: false 
    },
    { 
      label: lodestoneProcess ? '● Running' : '○ Stopped', 
      enabled: false 
    },
    { type: 'separator' },
    { label: 'New Chat', click: () => {
      mainWindow?.webContents.send('app:navigate', 'chat')
      mainWindow?.show()
      mainWindow?.focus()
    }},
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit() } }
  ])

  tray.setToolTip(`Lodestone — ${agentName}`)
  tray.setContextMenu(contextMenu)
  tray.on('click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

// ---- IPC handlers ----
function setupIPC() {
  ipcMain.handle('config:load', () => loadConfig())
  ipcMain.handle('config:save', (_, config: AgentConfig) => {
    saveConfig(config)
    return true
  })
  ipcMain.handle('config:hasWizard', () => hasCompletedWizard())

  ipcMain.handle('config:revealFile', () => {
    const configPath = getConfigPath()
    if (fs.existsSync(configPath)) {
      shell.showItemInFolder(configPath)
      return true
    }
    return false
  })

  ipcMain.handle('config:reset', () => {
    stopLodestone()
    const dataPath = getAppDataPath()
    try {
      if (fs.existsSync(dataPath)) {
        fs.rmSync(dataPath, { recursive: true, force: true })
      }
      ensureDirs()
      return true
    } catch {
      return false
    }
  })
  
  ipcMain.handle('engine:start', async (_, config: AgentConfig) => {
    try {
      const { port } = await startLodestone(config)
      return { success: true, port }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
  
  ipcMain.handle('engine:stop', () => {
    stopLodestone()
    return true
  })
  
  ipcMain.handle('engine:status', () => {
    return { running: lodestoneProcess !== null, port: lodestonePort }
  })

  ipcMain.handle('engine:uptime', () => {
    if (lodestoneProcess && engineStartTime) {
      return Date.now() - engineStartTime
    }
    return 0
  })
  
  ipcMain.handle('workspace:path', () => getWorkspacePath())
  
  ipcMain.handle('workspace:openInFinder', () => {
    shell.openPath(getWorkspacePath())
    return true
  })

  ipcMain.handle('workspace:exportAll', () => {
    const dataPath = getAppDataPath()
    const exportPath = path.join(dataPath, 'exports')
    if (!fs.existsSync(exportPath)) fs.mkdirSync(exportPath, { recursive: true })
    const exportFile = path.join(exportPath, `lodestone-export-${Date.now()}.json`)
    try {
      const workspace = getWorkspacePath()
      const config = loadConfig()
      const exportData: any = {
        timestamp: new Date().toISOString(),
        config: config ? { ...config, apiKey: '***REDACTED***' } : null,
        workspacePath: workspace,
      }
      // Collect wiki pages
      const wikiPath = path.join(workspace, 'wiki')
      if (fs.existsSync(wikiPath)) {
        exportData.wiki = []
        const collectMd = (dir: string) => {
          if (!fs.existsSync(dir)) return
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) collectMd(fullPath)
            else if (entry.name.endsWith('.md')) {
              exportData.wiki.push({ path: path.relative(workspace, fullPath), content: fs.readFileSync(fullPath, 'utf-8') })
            }
          }
        }
        collectMd(wikiPath)
      }
      // Collect memories
      const memoryPath = path.join(workspace, 'memory')
      if (fs.existsSync(memoryPath)) {
        exportData.memories = []
        const collectMem = (dir: string) => {
          if (!fs.existsSync(dir)) return
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) collectMem(fullPath)
            else if (entry.name.endsWith('.md') || entry.name.endsWith('.json')) {
              exportData.memories.push({ path: path.relative(workspace, fullPath), content: fs.readFileSync(fullPath, 'utf-8') })
            }
          }
        }
        collectMem(memoryPath)
      }
      fs.writeFileSync(exportFile, JSON.stringify(exportData, null, 2), 'utf-8')
      shell.showItemInFolder(exportFile)
      return exportFile
    } catch (err) {
      console.error('[lodestone] export failed:', err)
      return null
    }
  })

  ipcMain.handle('llm:testConnection', async (_, provider: string, apiKey: string, model: string, endpoint?: string) => {
    try {
      const url = provider === 'custom' && endpoint
        ? `${endpoint.replace(/\/$/, '')}/models`
        : provider === 'openai'
        ? 'https://api.openai.com/v1/models'
        : provider === 'anthropic'
        ? 'https://api.anthropic.com/v1/models'
        : provider === 'groq'
        ? 'https://api.groq.com/openai/v1/models'
        : provider === 'openrouter'
        ? 'https://openrouter.ai/api/v1/models'
        : provider === 'ollama-cloud'
        ? 'https://api.ollama.com/v1/models'
        : 'https://api.openai.com/v1/models'

      const headers: Record<string, string> = {}
      if (provider === 'anthropic') {
        headers['x-api-key'] = apiKey
        headers['anthropic-version'] = '2023-06-01'
      } else {
        headers['Authorization'] = `Bearer ${apiKey}`
      }

      const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
      if (res.ok) {
        return { success: true, message: `Connected successfully (${res.status})` }
      }
      return { success: false, message: `HTTP ${res.status}: ${res.statusText}` }
    } catch (err) {
      return { success: false, message: (err as Error).message }
    }
  })

  ipcMain.handle('app:version', () => app.getVersion())

  // Manual update check
  ipcMain.handle('update:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      if (result && result.updateInfo) {
        const current = app.getVersion()
        const latest = (result.updateInfo.version || '').replace(/^v/, '')
        return { available: latest !== current, version: latest, current }
      }
      return { available: false, current: app.getVersion() }
    } catch (err: any) {
      return { available: false, error: err.message, current: app.getVersion() }
    }
  })

  // Install downloaded update
  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall()
    return { success: true }
  })

  // Get download progress
  ipcMain.handle('update:progress', () => {
    return { downloading: false, percent: 0 }  // Placeholder; real progress via events
  })
  
  // Crash Reporter — append to ~/.lodestone/crash-log.txt
  ipcMain.handle('crash:writeLog', (_, message: string) => {
    try {
      const logPath = path.join(getAppDataPath(), 'crash-log.txt')
      fs.appendFileSync(logPath, message, 'utf-8')
      return true
    } catch {
      return false
    }
  })
  
  // Open external URL in default browser
  ipcMain.handle('shell:openExternal', (_, url: string) => {
    if (url.startsWith('http')) {
      shell.openExternal(url)
      return true
    }
    return false
  })
  
  // Navigate to a view (used by tray menu "New Chat")
  ipcMain.on('app:navigate', (_, view: string) => {
    mainWindow?.webContents.send('app:navigate', view)
    mainWindow?.show()
    mainWindow?.focus()
  })
  
  // Brain view — scan workspace for knowledge graph data
  ipcMain.handle('brain:scan', async () => {
    const workspace = getWorkspacePath()
    const wikiPath = path.join(workspace, 'wiki')
    const memoryPath = path.join(workspace, 'memory')
    
    const nodes: any[] = []
    let memoryCount = 0
    let wikiCount = 0
    let decisionCount = 0
    
    // Scan wiki directory
    if (fs.existsSync(wikiPath)) {
      const scanDir = (dir: string, type: string) => {
        if (!fs.existsSync(dir)) return
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            scanDir(fullPath, type)
          } else if (entry.name.endsWith('.md')) {
            const label = entry.name.replace(/\.md$/, '')
            nodes.push({ id: `${type}-${fullPath}`, label, type, path: fullPath })
            if (type === 'wiki') wikiCount++
            if (type === 'decision') decisionCount++
          }
        }
      }
      scanDir(wikiPath, 'wiki')
      scanDir(path.join(wikiPath, 'decisions'), 'decision')
    }
    
    // Scan memory directory
    if (fs.existsSync(memoryPath)) {
      const scanMemory = (dir: string) => {
        if (!fs.existsSync(dir)) return
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            scanMemory(path.join(dir, entry.name))
          } else if (entry.name.endsWith('.md') || entry.name.endsWith('.json')) {
            const fullPath = path.join(dir, entry.name)
            const label = entry.name.replace(/\.(md|json)$/, '')
            nodes.push({ id: `memory-${fullPath}`, label, type: 'memory', path: fullPath })
            memoryCount++
          }
        }
      }
      scanMemory(memoryPath)
    }
    
    // Build connections by scanning wikilinks in file contents
    for (const node of nodes) {
      node.connections = []
      if (node.type === 'wiki' || node.type === 'decision') {
        try {
          const content = fs.readFileSync(node.path, 'utf-8')
          // Find [[wikilinks]]
          const linkRegex = /\[\[([^\]]+)\]\]/g
          let match
          while ((match = linkRegex.exec(content)) !== null) {
            const linkTarget = match[1]
            // Find matching node
            const target = nodes.find(n => n.label === linkTarget || n.label.includes(linkTarget))
            if (target && target.id !== node.id) {
              node.connections.push(target.id)
            }
          }
        } catch { /* ignore read errors */ }
      }
    }
    
    return {
      nodes,
      stats: { memoryCount, wikiCount, decisionCount, toolCallCount: 0 },
    }
  })
  
  // Dashboard — get agent stats
  ipcMain.handle('dashboard:stats', async () => {
    const workspace = getWorkspacePath()
    const config = loadConfig()
    
    // Count wiki pages
    let wikiCount = 0
    const wikiPath = path.join(workspace, 'wiki')
    if (fs.existsSync(wikiPath)) {
      const countFiles = (dir: string) => {
        if (!fs.existsSync(dir)) return 0
        let count = 0
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name))
          else if (entry.name.endsWith('.md')) count++
        }
        return count
      }
      wikiCount = countFiles(wikiPath)
    }
    
    // Count memories
    let memoryCount = 0
    const memoryPath = path.join(workspace, 'memory')
    if (fs.existsSync(memoryPath)) {
      const countFiles = (dir: string) => {
        if (!fs.existsSync(dir)) return 0
        let count = 0
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name))
          else if (entry.name.endsWith('.md') || entry.name.endsWith('.json')) count++
        }
        return count
      }
      memoryCount = countFiles(memoryPath)
    }
    
    // Count scheduled jobs
    let jobCount = 0
    const schedulesPath = path.join(getAppDataPath(), 'schedules')
    if (fs.existsSync(schedulesPath)) {
      jobCount = fs.readdirSync(schedulesPath).filter(f => f.endsWith('.json')).length
    }
    
    // Count decisions
    let decisionCount = 0
    const decisionsPath = path.join(wikiPath, 'decisions')
    if (fs.existsSync(decisionsPath)) {
      decisionCount = fs.readdirSync(decisionsPath).filter(f => f.endsWith('.md')).length
    }
    
    // Read safety config
    const configPath = getConfigPath()
    let redLines: string[] = ['Never exfiltrate private data', 'Never run destructive commands without confirmation']
    let autoCapture = true
    let requireConfirmation = true
    if (fs.existsSync(configPath)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        if (cfg.redLines) redLines = cfg.redLines
        if (cfg.autoCapture !== undefined) autoCapture = cfg.autoCapture
        if (cfg.requireConfirmation !== undefined) requireConfirmation = cfg.requireConfirmation
      } catch { /* ignore */ }
    }
    
    return {
      wikiCount,
      memoryCount,
      jobCount,
      decisionCount,
      model: config?.model || 'unknown',
      provider: config?.llmProvider || 'unknown',
      redLines,
      autoCapture,
      requireConfirmation,
      engineRunning: lodestoneProcess !== null,
      uptime: lodestoneProcess ? Date.now() - engineStartTime : 0,
    }
  })
  
  // Safety — save safety settings
  ipcMain.handle('safety:update', (_, settings: { redLines?: string[]; autoCapture?: boolean; requireConfirmation?: boolean }) => {
    const configPath = getConfigPath()
    try {
      const config = loadConfig() || {} as any
      if (settings.redLines !== undefined) config.redLines = settings.redLines
      if (settings.autoCapture !== undefined) config.autoCapture = settings.autoCapture
      if (settings.requireConfirmation !== undefined) config.requireConfirmation = settings.requireConfirmation
      saveConfig(config)
      return true
    } catch {
      return false
    }
  })
  
  // Safety — read near-misses log
  ipcMain.handle('safety:nearMisses', () => {
    const workspace = getWorkspacePath()
    const logPath = path.join(workspace, 'logs', 'near-misses.json')
    if (!fs.existsSync(logPath)) return []
    try {
      return JSON.parse(fs.readFileSync(logPath, 'utf-8'))
    } catch { return [] }
  })
  
  // Safety — read learned constraints
  ipcMain.handle('safety:constraints', () => {
    const workspace = getWorkspacePath()
    const constraintsPath = path.join(workspace, 'memory', 'constraints.json')
    if (!fs.existsSync(constraintsPath)) return []
    try {
      return JSON.parse(fs.readFileSync(constraintsPath, 'utf-8'))
    } catch { return [] }
  })
  
  // History — read conversation logs
  ipcMain.handle('history:list', () => {
    const workspace = getWorkspacePath()
    const logsPath = path.join(workspace, 'logs', 'conversations')
    if (!fs.existsSync(logsPath)) return []
    const sessions: any[] = []
    const entries = fs.readdirSync(logsPath)
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      try {
        const data = JSON.parse(fs.readFileSync(path.join(logsPath, entry), 'utf-8'))
        sessions.push(data)
      } catch { /* skip corrupt files */ }
    }
    return sessions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
  })
  
  // History — read a specific conversation
  ipcMain.handle('history:get', (_, sessionId: string) => {
    const workspace = getWorkspacePath()
    const filePath = path.join(workspace, 'logs', 'conversations', `${sessionId}.json`)
    if (!fs.existsSync(filePath)) return null
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    } catch { return null }
  })
  
  // History — export session as markdown
  ipcMain.handle('history:export', (_, sessionId: string) => {
    const workspace = getWorkspacePath()
    const filePath = path.join(workspace, 'logs', 'conversations', `${sessionId}.json`)
    if (!fs.existsSync(filePath)) return null
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      let md = `# Conversation Export\n\n**Session:** ${sessionId}\n**Date:** ${new Date(data.timestamp || 0).toISOString()}\n**Messages:** ${data.messages?.length || 0}\n\n---\n\n`
      for (const msg of data.messages || []) {
        const role = msg.role === 'user' ? '👤 **User**' : msg.role === 'assistant' ? '🤖 **Agent**' : '⚙️ **System**'
        md += `${role}\n${msg.content}\n\n`
      }
      const exportPath = path.join(getAppDataPath(), 'exports')
      if (!fs.existsSync(exportPath)) fs.mkdirSync(exportPath, { recursive: true })
      const exportFile = path.join(exportPath, `${sessionId}.md`)
      fs.writeFileSync(exportFile, md, 'utf-8')
      return exportFile
    } catch (err) { return null }
  })

  // ─── Host Control ──────────────────────────────────────────────────

  // Execute shell command
  ipcMain.handle('host:exec', async (_, command: string, cwd?: string, timeoutMs?: number) => {
    return new Promise((resolve) => {
      const timeout = timeoutMs || 30000
      const proc = spawn(command, {
        cwd: cwd || process.cwd(),
        shell: true,
        timeout,
        env: { ...process.env },
      })
      let stdout = ''
      let stderr = ''
      proc.stdout.on('data', (data) => { stdout += data.toString() })
      proc.stderr.on('data', (data) => { stderr += data.toString() })
      proc.on('close', (code) => {
        resolve({ success: code === 0, stdout: stdout.slice(0, 100000), stderr: stderr.slice(0, 100000), exitCode: code })
      })
      proc.on('error', (err) => {
        resolve({ success: false, stdout: '', stderr: err.message, exitCode: null })
      })
    })
  })

  // List files in directory
  ipcMain.handle('host:listFiles', async (_, dirPath: string) => {
    try {
      if (!fs.existsSync(dirPath)) {
        return { success: false, files: [], error: 'Directory does not exist' }
      }
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      const files: any[] = entries.map(entry => {
        const fullPath = path.join(dirPath, entry.name)
        const stat = fs.statSync(fullPath)
        const ext = entry.isFile() ? entry.name.split('.').pop() || '' : undefined
        return {
          name: entry.name,
          path: fullPath,
          isDir: entry.isDirectory(),
          size: stat.size,
          modified: stat.mtime.toISOString(),
          extension: ext,
        }
      })
      // Dirs first, then files alphabetically
      files.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      return { success: true, files }
    } catch (err: any) {
      return { success: false, files: [], error: err.message }
    }
  })

  // Read file
  ipcMain.handle('host:readFile', async (_, filePath: string) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      return { success: true, content: content.slice(0, 500000) }
    } catch (err: any) {
      return { success: false, content: '', error: err.message }
    }
  })

  // Write file
  ipcMain.handle('host:writeFile', async (_, filePath: string, content: string) => {
    try {
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(filePath, content, 'utf-8')
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Delete file
  ipcMain.handle('host:deleteFile', async (_, filePath: string) => {
    try {
      fs.unlinkSync(filePath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Move/rename file
  ipcMain.handle('host:moveFile', async (_, src: string, dest: string) => {
    try {
      fs.renameSync(src, dest)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Make directory
  ipcMain.handle('host:makeDir', async (_, dirPath: string) => {
    try {
      fs.mkdirSync(dirPath, { recursive: true })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // System info
  ipcMain.handle('host:systemInfo', () => {
    const os = require('os')
    return {
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
      uptime: os.uptime(),
      loadAvg: os.loadavg(),
      totalMem: os.totalmem(),
      freeMem: os.freemem(),
      cpus: os.cpus().length,
      nodeVersion: process.version,
    }
  })

  // Process list (using ps on macOS/Linux, tasklist on Windows)
  ipcMain.handle('host:processList', async () => {
    return new Promise((resolve) => {
      const cmd = process.platform === 'win32' ? 'tasklist /FO CSV /NH' : 'ps aux --sort=-%cpu | head -50'
      const proc = spawn(cmd, { shell: true })
      let output = ''
      proc.stdout.on('data', (d) => { output += d.toString() })
      proc.on('close', () => {
        try {
          const processes: any[] = []
          if (process.platform === 'win32') {
            // Parse CSV from tasklist
            for (const line of output.trim().split('\n')) {
              const parts = line.replace(/"/g, '').split(',')
              if (parts.length >= 5) {
                processes.push({ pid: parseInt(parts[1]) || 0, name: parts[0], cpu: 0, memory: parseInt(parts[4].replace(/[^\d]/g, '')) || 0 })
              }
            }
          } else {
            // Parse ps output
            const lines = output.trim().split('\n').slice(1)
            for (const line of lines) {
              const parts = line.trim().split(/\s+/)
              if (parts.length >= 4) {
                processes.push({ pid: parseInt(parts[1]) || 0, name: parts[10] || parts.slice(10).join(' ') || 'unknown', cpu: parseFloat(parts[2]) || 0, memory: parseFloat(parts[3]) || 0 })
              }
            }
          }
          resolve({ success: true, processes })
        } catch (err: any) {
          resolve({ success: false, processes: [], error: err.message })
        }
      })
      proc.on('error', () => resolve({ success: false, processes: [], error: 'Failed to list processes' }))
    })
  })

  // Kill process
  ipcMain.handle('host:killProcess', (_, pid: number) => {
    try {
      process.kill(pid)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Open terminal
  ipcMain.handle('host:openTerminal', (_, command?: string) => {
    try {
      if (process.platform === 'darwin') {
        // macOS: use Terminal.app via AppleScript
        if (command) {
          spawn('osascript', ['-e', `tell application "Terminal" to do script "${command.replace(/"/g, '\\"')}"`])
        } else {
          spawn('open', ['-a', 'Terminal'])
        }
      } else if (process.platform === 'win32') {
        spawn('cmd', ['/c', 'start', 'cmd'])
      } else {
        // Linux: try x-terminal-emulator, gnome-terminal, xterm
        if (command) {
          spawn('sh', ['-c', `x-terminal-emulator -e '${command}' 2>/dev/null || gnome-terminal -- '${command}' 2>/dev/null || xterm -e '${command}'`])
        } else {
          spawn('sh', ['-c', 'x-terminal-emulator 2>/dev/null || gnome-terminal 2>/dev/null || xterm'])
        }
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Reveal file in Finder/Explorer
  ipcMain.handle('host:revealFile', (_, filePath: string) => {
    try {
      shell.showItemInFolder(filePath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Disk usage (du command on macOS/Linux)
  ipcMain.handle('host:diskUsage', (_, dirPath: string) => {
    return new Promise((resolve) => {
      if (!fs.existsSync(dirPath)) {
        resolve({ success: false, size: 0, fileCount: 0, error: 'Directory does not exist' })
        return
      }
      // Walk the directory to count files and sum sizes
      let totalSize = 0
      let fileCount = 0
      try {
        const walk = (dir: string) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true })
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
              walk(fullPath)
            } else {
              try {
                const stat = fs.statSync(fullPath)
                totalSize += stat.size
                fileCount++
              } catch {}
            }
          }
        }
        walk(dirPath)
        resolve({ success: true, size: totalSize, fileCount })
      } catch (err: any) {
        resolve({ success: false, size: 0, fileCount: 0, error: err.message })
      }
    })
  })

  // ─── File Watcher ──────────────────────────────────────────────

  // Map of watched paths to their fs.FSWatcher instances
  const watchers = new Map<string, fs.FSWatcher>()

  // Watch a directory for changes
  ipcMain.handle('host:watchPath', (_, dirPath: string) => {
    if (!fs.existsSync(dirPath)) {
      return { success: false, error: 'Directory does not exist' }
    }
    // Already watching?
    if (watchers.has(dirPath)) {
      return { success: true }
    }
    try {
      const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return
        const fullPath = path.join(dirPath, filename)
        // Map fs.watch event types to our event types
        let event: 'created' | 'modified' | 'deleted' | 'renamed' = 'modified'
        if (eventType === 'rename') {
          event = fs.existsSync(fullPath) ? 'created' : 'deleted'
        }
        mainWindow?.webContents.send('host:fileEvent', { path: fullPath, event })
      })
      watcher.on('error', () => {
        watchers.delete(dirPath)
      })
      watchers.set(dirPath, watcher)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // Stop watching a directory
  ipcMain.handle('host:unwatchPath', (_, dirPath: string) => {
    const watcher = watchers.get(dirPath)
    if (watcher) {
      watcher.close()
      watchers.delete(dirPath)
    }
    return { success: true }
  })
}

// ---- App lifecycle ----
app.whenReady().then(() => {
  ensureDirs()
  setupIPC()
  createWindow()
  createTray()

  // ─── Auto-Updater ──────────────────────────────────────────
  // Configure electron-updater for automatic background updates.
  // Checks GitHub releases for new versions. Downloads in background,
  // installs on next restart (or silently if checkForUpdatesAndNotify).
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false

  // Feed URL: GitHub releases from GreyrockStudios/lodestone-desktop
  // electron-updater reads latest-mac.yml (mac) from releases assets.
  // For dev/unpublished builds, this silently fails — that's fine.
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'GreyrockStudios',
    repo: 'lodestone-desktop',
    // Use private token if available (for private repos)
    // token: process.env.GH_TOKEN,
  })

  // Log updater events for debugging
  autoUpdater.logger = {
    error: (msg: string) => console.error('[autoUpdater]', msg),
    info: (msg: string) => console.info('[autoUpdater]', msg),
    debug: (msg: string) => console.log('[autoUpdater]', msg),
    warn: (msg: string) => console.warn('[autoUpdater]', msg),
  }

  // Events
  autoUpdater.on('update-available', (info: any) => {
    console.log('[autoUpdater] Update available:', info.version)
    mainWindow?.webContents.send('update:available', {
      version: info.version || 'unknown',
      releaseDate: info.releaseDate || '',
    })
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[autoUpdater] App is up to date')
    mainWindow?.webContents.send('update:not-available')
  })

  autoUpdater.on('download-progress', (progress: any) => {
    mainWindow?.webContents.send('update:progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      speed: progress.bytesPerSecond,
    })
  })

  autoUpdater.on('update-downloaded', (info: any) => {
    console.log('[autoUpdater] Update downloaded:', info.version)
    mainWindow?.webContents.send('update:downloaded', {
      version: info.version || 'unknown',
    })
    // Auto-quit and install after 5 seconds
    setTimeout(() => {
      autoUpdater.quitAndInstall()
    }, 5000)
  })

  autoUpdater.on('error', (err: Error) => {
    // Silently fail — don't bother user with update errors
    // This is expected in dev mode or before first release
    console.error('[autoUpdater]', err.message)
  })

  // Check for updates on startup (silently fails in dev / before first release)
  autoUpdater.checkForUpdates().catch(() => {
    // Dev mode, no releases yet, or offline — expected
    console.log('[autoUpdater] No updates available (dev/offline/no releases)')
  })

  // Check every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 4 * 60 * 60 * 1000)
})

app.on('before-quit', () => {
  isQuitting = true
  stopLodestone()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  } else {
    mainWindow?.show()
  }
})