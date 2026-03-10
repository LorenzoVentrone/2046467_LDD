/**
 * useLogStream — connects to /ws/logs and merges backend pipeline events
 * with frontend-emitted events from pipelineLogger.js into one unified stream.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { onPipelineLog } from '../pipelineLogger'

const MAX_ENTRIES = 600

function getLogsWsUrl() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL.replace(/\/$/, '') + '/logs'
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws/logs`
}

export function useLogStream() {
  const [entries, setEntries]   = useState([])
  const [connected, setConnected] = useState(false)
  const ws = useRef(null)

  const append = useCallback((entry) => {
    setEntries(prev => [...prev, { ...entry, _id: Date.now() + Math.random() }].slice(-MAX_ENTRIES))
  }, [])

  const connect = useCallback(() => {
    try {
      ws.current = new WebSocket(getLogsWsUrl())
    } catch (_) {
      setTimeout(connect, 3000)
      return
    }

    ws.current.onopen = () => setConnected(true)

    ws.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'pipeline_log') append(data)
      } catch (_) {}
    }

    ws.current.onclose = () => {
      setConnected(false)
      setTimeout(connect, 3000)
    }

    ws.current.onerror = () => {}
  }, [append])

  useEffect(() => {
    connect()
    // Also merge local frontend-emitted events
    const unsub = onPipelineLog(append)
    return () => {
      ws.current?.close()
      unsub()
    }
  }, [connect, append])

  const clear = useCallback(() => setEntries([]), [])

  return { entries, connected, clear }
}
