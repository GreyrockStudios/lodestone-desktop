import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } from 'electron'
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
    // In dev, use npx to run the local lodestone package
    return { cmd: 'npx', args: ['lodestone'] }
  }
  // In production, lodestone is installed as a dependency
  // The bin is at node_modules/.bin/lodestone
  const lodestoneBin = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    '.bin',
    'lodestone'
  )
  return { cmd: lodestoneBin, args: [] }
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
      lodestoneProcess = spawn(cmd, args, {
        cwd: getWorkspacePath(),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'production'
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
}

// ---- App lifecycle ----
app.whenReady().then(() => {
  ensureDirs()
  setupIPC()
  createWindow()
  createTray()
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