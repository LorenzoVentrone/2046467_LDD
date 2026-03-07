import { useEffect, useRef, useState, useCallback } from 'react'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8001'

export function useWebSocket() {
  const [sensorState, setSensorState] = useState({})
  const ws = useRef(null)

  const connect = useCallback(() => {
    ws.current = new WebSocket(`${WS_URL}/ws`)

    ws.current.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        if (event.sensor_id) {
          setSensorState(prev => ({ ...prev, [event.sensor_id]: event }))
        }
      } catch (_) {}
    }

    ws.current.onclose = () => {
      setTimeout(connect, 3000)
    }
  }, [])

  useEffect(() => {
    connect()
    return () => ws.current?.close()
  }, [connect])

  return sensorState
}
