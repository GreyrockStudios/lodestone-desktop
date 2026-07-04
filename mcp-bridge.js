// ─── MCP (Model Context Protocol) Bridge ────────────────────────────────────
// Allows Lodestone to expose tools via MCP protocol and invoke MCP tools from
// connected servers. Runs in Electron main process.

const { ipcMain } = require('electron')
const net = require('net')
const fs = require('fs')
const path = require('path')
const os = require('os')

// ─── MCP Server ─────────────────────────────────────────────────────────────
// Exposes Lodestone's built-in tools as MCP tools for external clients

class MCPServer {
  constructor(tools) {
    this.tools = tools
    this.clients = []
    this.server = null
  }

  start(port = 9515) {
    this.server = net.createServer((socket) => {
      let buffer = ''
      socket.on('data', (data) => {
        buffer += data.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() // keep incomplete line
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const msg = JSON.parse(line)
            this.handleMessage(msg, socket)
          } catch (e) {
            // Not JSON, ignore
          }
        }
      })

      socket.on('close', () => {
        this.clients = this.clients.filter(c => c !== socket)
      })

      this.clients.push(socket)
    })

    const tryListen = (p) => {
      this.server.listen(p, '127.0.0.1', () => {
        console.log(`[MCP] Server listening on 127.0.0.1:${p}`)
      })
    }

    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        if (port < 9530) {
          console.log(`[MCP] Port ${port} in use, trying ${port + 1}...`)
          port++
          tryListen(port)
        } else {
          console.error(`[MCP] Could not find available port after 9515-9530`)
          this.server = null
        }
      } else {
        console.error(`[MCP] Server error:`, err)
      }
    })

    tryListen(port)
  }

  stop() {
    if (this.server) {
      this.server.close()
      this.clients.forEach(c => c.destroy())
      this.clients = []
    }
  }

  async handleMessage(msg, socket) {
    const { jsonrpc, id, method, params } = msg

    if (method === 'initialize') {
      this.send(socket, {
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'Lodestone', version: '0.1.4' }
        }
      })
      return
    }

    if (method === 'notifications/initialized') return

    if (method === 'tools/list') {
      const tools = this.tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema || { type: 'object', properties: {} }
      }))
      this.send(socket, { jsonrpc: '2.0', id, result: { tools } })
      return
    }

    if (method === 'tools/call') {
      const toolName = params?.name
      const toolArgs = params?.arguments || {}
      const tool = this.tools.find(t => t.name === toolName)
      if (!tool) {
        this.send(socket, { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${toolName}` } })
        return
      }
      try {
        const result = await tool.handler(toolArgs)
        this.send(socket, {
          jsonrpc: '2.0', id,
          result: { content: [{ type: 'text', text: JSON.stringify(result) }] }
        })
      } catch (err) {
        this.send(socket, {
          jsonrpc: '2.0', id,
          result: { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
        })
      }
      return
    }

    this.send(socket, { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${method}` } })
  }

  send(socket, msg) {
    socket.write(JSON.stringify(msg) + '\n')
  }
}

// ─── MCP Client ─────────────────────────────────────────────────────────────
// Connects to external MCP servers and invokes their tools

class MCPClient {
  constructor() {
    this.connections = new Map() // name -> { socket, tools, connected }
  }

  async connect(name, command, args = [], env = {}) {
    if (this.connections.has(name)) {
      await this.disconnect(name)
    }

    const { spawn } = require('child_process')
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let buffer = ''
    let msgId = 0
    const pending = new Map()
    const tools = []

    const send = (msg) => {
      child.stdin.write(JSON.stringify(msg) + '\n')
    }

    const handleMessage = (msg) => {
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
      }
    }

    child.stdout.on('data', (data) => {
      buffer += data.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        if (!line.trim()) continue
        try { handleMessage(JSON.parse(line)) } catch {}
      }
    })

    child.stderr.on('data', (data) => {
      console.error(`[MCP:${name}]`, data.toString().trim())
    })

    // Initialize
    const initResult = await new Promise((resolve, reject) => {
      const id = ++msgId
      pending.set(id, { resolve, reject })
      send({ jsonrpc: '2.0', id, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'Lodestone', version: '0.1.4' } } })
      setTimeout(() => { pending.delete(id); reject(new Error('Initialize timeout')) }, 30000)
    })

    // Send initialized notification
    send({ jsonrpc: '2.0', method: 'notifications/initialized' })

    // List tools
    const toolsResult = await new Promise((resolve, reject) => {
      const id = ++msgId
      pending.set(id, { resolve, reject })
      send({ jsonrpc: '2.0', id, method: 'tools/list', params: {} })
      setTimeout(() => { pending.delete(id); reject(new Error('Tools list timeout')) }, 15000)
    })

    tools.push(...(toolsResult?.tools || []))

    this.connections.set(name, {
      child, send, pending, msgId, tools,
      call: async (toolName, args) => {
        const id = ++pending.msgId
        return new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject })
          send({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: toolName, arguments: args } })
          setTimeout(() => { pending.delete(id); reject(new Error('Tool call timeout')) }, 30000)
        })
      },
      connected: true
    })

    return { name, tools: toolsResult?.tools || [] }
  }

  async disconnect(name) {
    const conn = this.connections.get(name)
    if (conn) {
      conn.child.kill()
      this.connections.delete(name)
    }
  }

  async callTool(serverName, toolName, args = {}) {
    const conn = this.connections.get(serverName)
    if (!conn?.connected) throw new Error(`MCP server ${serverName} not connected`)
    return conn.call(toolName, args)
  }

  getTools() {
    const allTools = []
    for (const [name, conn] of this.connections) {
      for (const tool of conn.tools) {
        allTools.push({ ...tool, server: name })
      }
    }
    return allTools
  }

  getConnections() {
    return Array.from(this.connections.entries()).map(([name, conn]) => ({
      name,
      connected: conn.connected,
      toolCount: conn.tools.length
    }))
  }
}

// ─── Bundled MCP Servers ──────────────────────────────────────────────────
// Pre-installed servers that ship with Lodestone Desktop.
// Auto-start on launch unless the user has disabled them.

const BUNDLED_SERVERS_PATH = path.join(__dirname, 'mcp-servers.json')

function loadBundledServers() {
  try {
    const raw = fs.readFileSync(BUNDLED_SERVERS_PATH, 'utf-8')
    const data = JSON.parse(raw)
    return data.bundled || []
  } catch (err) {
    console.error('[MCP] Failed to load bundled servers config:', err.message)
    return []
  }
}

async function autoStartBundledServers() {
  const servers = loadBundledServers()
  const store = require('electron-store') // lazy to avoid circular
  const settings = new (require('electron-store'))({
    defaults: { mcpAutoStart: {} }
  })

  let started = 0
  let failed = 0

  for (const server of servers) {
    // Check if user has disabled auto-start for this server
    const userDisabled = settings.get(`mcpAutoStart.${server.id}`) === false
    if (!server.autoStart || userDisabled) {
      console.debug(`[MCP] Skipping auto-start for ${server.name} (autoStart=${server.autoStart}, disabled=${userDisabled})`)
      continue
    }

    // Don't start if already connected
    if (mcpClient.connections.has(server.id)) {
      console.debug(`[MCP] already connected, skipping`)
      continue
    }

    try {
      console.log(`[MCP] Auto-starting bundled server: ${server.name}`)
      // Resolve app-relative paths for bundled servers
      const appDir = path.dirname(require.main.filename)
      const resolvedArgs = (server.args || []).map(a => {
        if (a.startsWith('node_modules/')) return path.join(appDir, a)
        if (a === '$HOME') return os.homedir()
        return a
      })
      // For bundled node-based servers, use Electron's bundled node
      // Set NODE_PATH so ESM servers can resolve their dependencies
      const resolvedCommand = server.command === 'node' ? process.execPath : server.command
      const extraEnv = {
        ...server.env,
        NODE_PATH: [path.join(appDir, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
      }
      const result = await mcpClient.connect(server.id, resolvedCommand, resolvedArgs, extraEnv)
      if (result.error) {
        console.error(`[MCP] Failed to auto-start ${server.name}: ${result.error}`)
        failed++
      } else {
        console.log(`[MCP] Auto-started ${server.name} — ${result.tools?.length || 0} tools available`)
        started++
      }
    } catch (err) {
      console.error(`[MCP] Error auto-starting ${server.name}:`, err.message)
      failed++
    }
  }

  console.log(`[MCP] Auto-start complete: ${started} started, ${failed} failed`)
  return { started, failed }
}

function getBundledServers() {
  return loadBundledServers()
}

function getMarketplaceServers() {
  try {
    const raw = fs.readFileSync(BUNDLED_SERVERS_PATH, 'utf-8')
    const data = JSON.parse(raw)
    return data.marketplace || []
  } catch {
    return []
  }
}

function getAllServers() {
  const bundled = loadBundledServers().map(s => ({ ...s, installed: true }))
  const marketplace = getMarketplaceServers().map(s => ({
    ...s,
    installed: mcpClient.connections.has(s.id)
  }))
  return { bundled, marketplace, total: bundled.length + marketplace.length }
}

// ─── Export & IPC ──────────────────────────────────────────────────────────

let mcpServer = null
let mcpClient = null

function initMCP(tools) {
  mcpServer = new MCPServer(tools)
  mcpServer.start()

  mcpClient = new MCPClient()

  // IPC: Connect to MCP server
  ipcMain.handle('mcp:connect', async (_e, name, command, args, env) => {
    try {
      return await mcpClient.connect(name, command, args, env)
    } catch (err) {
      return { error: err.message }
    }
  })

  // IPC: Disconnect from MCP server
  ipcMain.handle('mcp:disconnect', async (_e, name) => {
    await mcpClient.disconnect(name)
    return { success: true }
  })

  // IPC: Call MCP tool
  ipcMain.handle('mcp:call-tool', async (_e, serverName, toolName, args) => {
    try {
      return await mcpClient.callTool(serverName, toolName, args)
    } catch (err) {
      return { error: err.message }
    }
  })

  // IPC: List all MCP tools
  ipcMain.handle('mcp:list-tools', () => mcpClient.getTools())

  // IPC: List connections
  ipcMain.handle('mcp:list-connections', () => mcpClient.getConnections())

  // IPC: Get bundled + marketplace server catalog
  ipcMain.handle('mcp:get-servers', () => getAllServers())

  // IPC: Auto-start bundled servers (called from renderer after UI loads)
  ipcMain.handle('mcp:auto-start-bundled', async () => {
    return await autoStartBundledServers()
  })

  // IPC: Set auto-start preference for a bundled server
  ipcMain.handle('mcp:set-auto-start', (_e, serverId, enabled) => {
    const store = new (require('electron-store'))({
      defaults: { mcpAutoStart: {} }
    })
    store.set(`mcpAutoStart.${serverId}`, enabled)
    return { success: true }
  })
}

function cleanupMCP() {
  if (mcpServer) mcpServer.stop()
  if (mcpClient) {
    for (const name of mcpClient.connections.keys()) {
      mcpClient.disconnect(name)
    }
  }
}

module.exports = { MCPServer, MCPClient, initMCP, cleanupMCP, getBundledServers, getMarketplaceServers, getAllServers, autoStartBundledServers }