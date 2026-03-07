import { useEffect, useRef, useState, useCallback } from 'react'

const HISTORY_SIZE = 30

function getWsUrl() {
  // In production (Docker), use the same host the page was loaded from (nginx proxies /ws)
  // In dev, use VITE_WS_URL or fallback to current host
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}`
}

export function useWebSocket() {
  const [sensorState, setSensorState] = useState({})
  const [sensorHistory, setSensorHistory] = useState({})
  const [alerts, setAlerts] = useState([])
  const [eventLog, setEventLog] = useState([])
  const ws = useRef(null)

  const connect = useCallback(() => {
    const base = getWsUrl()
    ws.current = new WebSocket(`${base}/ws`)

    ws.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)

        // Handle alert messages from the rules engine
        if (data.type === 'alert') {
          setAlerts(prev => [...prev, data])
          return
        }

        // Handle sensor events
        if (data.sensor_id) {
          setSensorState(prev => ({ ...prev, [data.sensor_id]: data }))

          // Append to history (rolling buffer)
          setSensorHistory(prev => {
            const existing = prev[data.sensor_id] || []
            const updated = [...existing, data].slice(-HISTORY_SIZE)
            return { ...prev, [data.sensor_id]: updated }
          })

          // Append to event log (keep last 50)
          setEventLog(prev => [data, ...prev].slice(0, 50))
        }
      } catch (_) { }
    }

    ws.current.onclose = () => {
      setTimeout(connect, 3000)
    }

    ws.current.onerror = () => {
      // Silently handle - onclose will trigger reconnect
    }
  }, [])

  useEffect(() => {
    connect()
    return () => ws.current?.close()
  }, [connect])

  return { sensorState, sensorHistory, alerts, eventLog }
}
