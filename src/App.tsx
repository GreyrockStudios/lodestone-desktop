import { useState, useEffect } from 'react'
import { Wizard } from './components/Wizard'
import { Sidebar } from './components/Sidebar'
import { Chat } from './views/Chat'
import { Memory } from './views/Memory'
import { Tools } from './views/Tools'
import { Schedule } from './views/Schedule'
import { Identity } from './views/Identity'
import { SettingsView } from './views/Settings'
import { useStore, type AgentConfig } from './store'

export default function App() {
  const { hasConfig, setHasConfig, activeView, setConfig, setEngineState } = useStore()

  useEffect(() => {
    // Check if wizard is completed
    window.lodestone.hasCompletedWizard().then((done: boolean) => {
      setHasConfig(done)
      if (done) {
        window.lodestone.loadConfig().then((cfg: AgentConfig | null) => {
          if (cfg) {
            setConfig(cfg)
            // Try to start engine automatically
            window.lodestone.startEngine(cfg).then((result: any) => {
              if (result.success) {
                setEngineState(true, result.port)
              }
            })
          }
        })
      }
    })

    // Listen for engine crash
    window.lodestone.onEngineCrashed(() => {
      setEngineState(false, 0)
    })
  }, [])

  if (!hasConfig) {
    return (
      <Wizard
        onComplete={(config: AgentConfig) => {
          setConfig(config)
          setHasConfig(true)
          setEngineState(true, 0)
        }}
      />
    )
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        {activeView === 'chat' && <Chat />}
        {activeView === 'memory' && <Memory />}
        {activeView === 'tools' && <Tools />}
        {activeView === 'schedule' && <Schedule />}
        {activeView === 'identity' && <Identity />}
        {activeView === 'settings' && <SettingsView />}
      </main>
    </div>
  )
}