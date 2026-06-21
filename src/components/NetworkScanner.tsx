import { useState, useCallback } from 'react'
import {
  Wifi, Globe, Server, RefreshCw, Search, Network, Download, Upload, AlertTriangle, Check, X
} from 'lucide-react'

interface NetworkInfo {
  localIP: string
  publicIP: string
  dnsServers: string[]
  openPorts: { protocol: string; localAddress: string; port: string; process: string }[]
}

interface PortScanResult {
  host: string
  port: number
  open: boolean
}

export function NetworkScanner() {
  const [info, setInfo] = useState<NetworkInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Port scanner state
  const [scanHost, setScanHost] = useState('')
  const [scanStart, setScanStart] = useState(1)
  const [scanEnd, setScanEnd] = useState(100)
  const [scanning, setScanning] = useState(false)
  const [scanResults, setScanResults] = useState<PortScanResult[]>([])
  const [scanProgress, setScanProgress] = useState(0)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    // Local IP
    const ifconfigResult = await window.lodestone.execCommand('ifconfig | grep "inet " | grep -v 127.0.0.1 | awk "{print \\$2}" | head -1', undefined, 5000)
    const localIP = ifconfigResult.success ? ifconfigResult.stdout.trim() : '—'

    // Public IP
    const publicResult = await window.lodestone.execCommand('curl -s --connect-timeout 5 ifconfig.me', undefined, 10000)
    const publicIP = publicResult.success ? publicResult.stdout.trim() : '—'

    // DNS servers
    const dnsResult = await window.lodestone.execCommand('cat /etc/resolv.conf 2>/dev/null | grep nameserver | awk "{print \\$2}"', undefined, 5000)
    const dnsServers = dnsResult.success ? dnsResult.stdout.trim().split('\n').filter(s => s) : []

    // Open ports
    const portsResult = await window.lodestone.execCommand('lsof -i -P -n 2>/dev/null | grep LISTEN', undefined, 10000)
    const openPorts: NetworkInfo['openPorts'] = []
    if (portsResult.success) {
      for (const line of portsResult.stdout.trim().split('\n')) {
        if (!line.trim()) continue
        const parts = line.trim().split(/\s+/)
        if (parts.length < 9) continue
        const process = parts[0]
        const protocol = parts[7] || ''
        const localAddress = parts[8] || ''
        const portMatch = localAddress.match(/:(\d+)$/)
        const port = portMatch ? portMatch[1] : ''
        openPorts.push({ protocol, localAddress, port, process })
      }
    }

    setInfo({ localIP, publicIP, dnsServers, openPorts })
    setLoading(false)
  }, [])

  const handleScan = async () => {
    if (!scanHost || scanStart > scanEnd) return
    setScanning(true)
    setScanResults([])
    setScanProgress(0)

    const results: PortScanResult[] = []
    const total = scanEnd - scanStart + 1

    // Scan in small batches for responsiveness
    const batchSize = 10
    for (let start = scanStart; start <= scanEnd; start += batchSize) {
      const end = Math.min(start + batchSize - 1, scanEnd)
      const promises: Promise<PortScanResult>[] = []
      for (let port = start; port <= end; port++) {
        const cmd = `nc -z -w1 ${scanHost} ${port} 2>/dev/null && echo OPEN || echo CLOSED`
        promises.push(
          window.lodestone.execCommand(cmd, undefined, 5000).then(r => ({
            host: scanHost,
            port,
            open: r.stdout.trim() === 'OPEN',
          }))
        )
      }
      const batchResults = await Promise.all(promises)
      for (const r of batchResults) {
        if (r.open) results.push(r)
      }
      setScanProgress(Math.round(((end - scanStart + 1) / total) * 100))
      // Update results progressively
      setScanResults([...results])
    }

    setScanning(false)
    setScanProgress(100)
  }

  return (
    <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--bg-card)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 sticky top-0 z-10" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        <Network className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Network Scanner</span>
        <div className="flex-1" />
        <button onClick={refresh} disabled={loading} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)', opacity: loading ? 0.5 : 1 }} title="Refresh">
          <RefreshCw className={loading ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} /> Refresh
        </button>
      </div>

      {loading && !info ? (
        <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-dim)' }}>
          <RefreshCw className="w-5 h-5 animate-spin" />
        </div>
      ) : info ? (
        <div className="p-4 space-y-4">
          {/* Network Info Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-1">
                <Wifi className="w-4 h-4" style={{ color: '#10B981' }} />
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Local IP</span>
              </div>
              <div className="text-sm font-mono font-medium" style={{ color: 'var(--text)' }}>{info.localIP}</div>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-4 h-4" style={{ color: '#3B82F6' }} />
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Public IP</span>
              </div>
              <div className="text-sm font-mono font-medium" style={{ color: 'var(--text)' }}>{info.publicIP}</div>
            </div>
          </div>

          {/* DNS Servers */}
          <div className="p-3 rounded-xl" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-4 h-4" style={{ color: '#8B5CF6' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>DNS Servers</span>
            </div>
            {info.dnsServers.length > 0 ? (
              <div className="space-y-1">
                {info.dnsServers.map((dns, i) => (
                  <div key={i} className="text-xs font-mono" style={{ color: 'var(--text-dim)' }}>{dns}</div>
                ))}
              </div>
            ) : (
              <div className="text-xs" style={{ color: 'var(--text-dim)' }}>No DNS servers found</div>
            )}
          </div>

          {/* Open Ports */}
          <div className="p-3 rounded-xl" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Network className="w-4 h-4" style={{ color: '#F59E0B' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>Listening Ports</span>
              <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
                {info.openPorts.length}
              </span>
            </div>
            {info.openPorts.length > 0 ? (
              <div className="overflow-auto max-h-48">
                <div className="grid grid-cols-[1fr_1fr_60px_1fr] gap-2 px-1 py-1 text-xs font-medium" style={{ color: 'var(--text-dim)' }}>
                  <span>Process</span>
                  <span>Local Address</span>
                  <span className="text-right">Port</span>
                  <span>Protocol</span>
                </div>
                {info.openPorts.map((port, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_60px_1fr] gap-2 px-1 py-1 text-xs" style={{ borderTop: '1px solid var(--border)' }}>
                    <span className="truncate" style={{ color: 'var(--text)' }}>{port.process}</span>
                    <span className="truncate font-mono" style={{ color: 'var(--text-dim)' }}>{port.localAddress}</span>
                    <span className="text-right font-mono" style={{ color: '#F59E0B' }}>{port.port}</span>
                    <span className="font-mono" style={{ color: 'var(--text-dim)' }}>{port.protocol}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs" style={{ color: 'var(--text-dim)' }}>No listening ports found</div>
            )}
          </div>

          {/* Port Scanner */}
          <div className="p-3 rounded-xl" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Search className="w-4 h-4" style={{ color: '#EC4899' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>Port Scanner</span>
            </div>
            <div className="flex items-end gap-2 mb-3">
              <div className="flex-1">
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-dim)' }}>Host</label>
                <input value={scanHost} onChange={e => setScanHost(e.target.value)} placeholder="e.g. 192.168.1.1" className="w-full px-2 py-1.5 rounded-lg text-xs outline-none" style={{ background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)' }} />
              </div>
              <div className="w-20">
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-dim)' }}>Start</label>
                <input type="number" value={scanStart} onChange={e => setScanStart(parseInt(e.target.value) || 1)} min={1} max={65535} className="w-full px-2 py-1.5 rounded-lg text-xs outline-none" style={{ background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)' }} />
              </div>
              <div className="w-20">
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-dim)' }}>End</label>
                <input type="number" value={scanEnd} onChange={e => setScanEnd(parseInt(e.target.value) || 100)} min={1} max={65535} className="w-full px-2 py-1.5 rounded-lg text-xs outline-none" style={{ background: 'var(--bg-elevated)', color: 'var(--text)', border: '1px solid var(--border)' }} />
              </div>
              <button onClick={handleScan} disabled={!scanHost || scanning} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs" style={{ background: 'rgba(236,72,153,0.15)', color: '#EC4899', opacity: (!scanHost || scanning) ? 0.5 : 1 }}>
                {scanning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                {scanning ? 'Scanning...' : 'Scan'}
              </button>
            </div>

            {/* Scan progress */}
            {scanning && (
              <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Scanning {scanHost}:{scanStart}-{scanEnd}</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--text)' }}>{scanProgress}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${scanProgress}%`, background: '#EC4899' }} />
                </div>
              </div>
            )}

            {/* Scan results */}
            {scanResults.length > 0 && (
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Open ports found:</div>
                <div className="space-y-1">
                  {scanResults.map(r => (
                    <div key={r.port} className="flex items-center gap-2 text-xs px-2 py-1 rounded" style={{ background: 'rgba(16,185,129,0.08)' }}>
                      <Check className="w-3 h-3" style={{ color: '#10B981' }} />
                      <span className="font-mono" style={{ color: 'var(--text)' }}>{r.host}:{r.port}</span>
                      <span style={{ color: '#10B981' }}>OPEN</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!scanning && scanResults.length === 0 && scanProgress > 0 && (
              <div className="text-xs flex items-center gap-2" style={{ color: 'var(--text-dim)' }}>
                <X className="w-3 h-3" /> No open ports found in range
              </div>
            )}
          </div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-full" style={{ color: '#EF4444' }}>
          <AlertTriangle className="w-5 h-5 mr-2" /> {error}
        </div>
      ) : null}
    </div>
  )
}