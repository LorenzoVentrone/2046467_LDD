import React, { useEffect, useState } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8001'

const LABELS = {
  cooling_fan:          'Cooling Fan',
  entrance_humidifier:  'Entrance Humidifier',
  hall_ventilation:     'Hall Ventilation',
  habitat_heater:       'Habitat Heater',
}

export default function ActuatorToggle({ actuatorId }) {
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchState = () => {
    fetch(`${API}/api/actuators`)
      .then(r => r.json())
      .then(data => {
        // simulator returns {"actuators": {"cooling_fan": "OFF", ...}}
        const map = data.actuators ?? data
        if (Array.isArray(map)) {
          const found = map.find(a => a.id === actuatorId || a.name === actuatorId)
          if (found) setState(typeof found === 'string' ? found : (found.state ?? found.status ?? 'OFF'))
        } else if (map[actuatorId] !== undefined) {
          const found = map[actuatorId]
          setState(typeof found === 'string' ? found : (found.state ?? found.status ?? 'OFF'))
        }
      })
      .catch(() => {})
  }

  useEffect(() => {
    fetchState()
    const interval = setInterval(fetchState, 3000)
    return () => clearInterval(interval)
  }, [actuatorId])

  const toggle = async () => {
    const next = state === 'ON' ? 'OFF' : 'ON'
    setLoading(true)
    try {
      const resp = await fetch(`${API}/api/actuators/${actuatorId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: next }),
      })
      if (resp.ok) setState(next)
    } catch (_) {}
    setLoading(false)
  }

  const isOn = state === 'ON'

  return (
    <div style={styles.card}>
      <div style={styles.label}>{LABELS[actuatorId] || actuatorId}</div>
      <button
        onClick={toggle}
        disabled={loading || state === null}
        style={{ ...styles.btn, background: isOn ? '#16a34a' : '#374151' }}
      >
        {state ?? '…'}
      </button>
    </div>
  )
}

const styles = {
  card: {
    background: '#111827',
    border: '1px solid #1e3a5f',
    borderRadius: 8,
    padding: '14px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    alignItems: 'center',
    minWidth: 150,
  },
  label: { fontSize: 11, color: '#6b8fa8', textTransform: 'uppercase', letterSpacing: 1 },
  btn: {
    border: 'none', borderRadius: 6, padding: '8px 24px',
    color: '#fff', fontWeight: 'bold', cursor: 'pointer',
    fontSize: 14, width: '100%',
  },
}
