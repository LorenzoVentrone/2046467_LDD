import { useEffect, useRef, useState, useCallback } from 'react'

const HISTORY_SIZE = 30

function getWsUrl() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL.replace(/\/$/, '')
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // If running via standard proxy (Nginx or Vite), just use the origin
  return `${proto}//${window.location.host}`
}

export function useWebSocket() {
  const [sensorState, setSensorState] = useState({})
  const [sensorHistory, setSensorHistory] = useState({})
  const [alerts, setAlerts] = useState([])
  const [eventLog, setEventLog] = useState([])
  const [connected, setConnected] = useState(false)
  const ws = useRef(null)

  const connect = useCallback(() => {
    const base = getWsUrl()
    ws.current = new WebSocket(`${base}/ws`)

    ws.current.onopen = () => {
      setConnected(true)
    }

    ws.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)

        if (data.type === 'alert') {
          setAlerts(prev => [...prev, data])
          return
        }

        if (data.sensor_id) {
          setSensorState(prev => ({ ...prev, [data.sensor_id]: data }))

          setSensorHistory(prev => {
            const existing = prev[data.sensor_id] || []
            const updated = [...existing, data].slice(-HISTORY_SIZE)
            return { ...prev, [data.sensor_id]: updated }
          })

          setEventLog(prev => [data, ...prev].slice(0, 50))
        }
      } catch (_) { }
    }

    ws.current.onclose = () => {
      setConnected(false)
      setTimeout(connect, 3000)
    }

    ws.current.onerror = () => {
      // Silently handle — onclose will trigger reconnect
    }
  }, [])

  useEffect(() => {
    connect()
    return () => ws.current?.close()
  }, [connect])

  return { sensorState, sensorHistory, alerts, eventLog, connected }
}
