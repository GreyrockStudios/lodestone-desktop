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

// ---- Window management ----
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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
  })

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

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray() {
  // Create a simple tray icon
  const size = 16
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Lodestone', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit() } }
  ])

  tray.setToolTip('Lodestone')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => mainWindow?.show())
}

// ---- IPC handlers ----
function setupIPC() {
  ipcMain.handle('config:load', () => loadConfig())
  ipcMain.handle('config:save', (_, config: AgentConfig) => {
    saveConfig(config)
    return true
  })
  ipcMain.handle('config:hasWizard', () => hasCompletedWizard())
  
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
  
  ipcMain.handle('workspace:path', () => getWorkspacePath())
  
  ipcMain.handle('workspace:openInFinder', () => {
    shell.openPath(getWorkspacePath())
    return true
  })

  ipcMain.handle('app:version', () => app.getVersion())
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