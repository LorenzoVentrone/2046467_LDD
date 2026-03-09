import React, { useEffect, useState } from 'react'
import { FaRegSnowflake } from "react-icons/fa";
import { FaDroplet } from "react-icons/fa6";
import { FaWind } from "react-icons/fa";
import { FaFire } from "react-icons/fa";

const API = import.meta.env.VITE_API_URL || ''

const LABELS = {
  cooling_fan: 'Cooling Fan',
  entrance_humidifier: 'Entrance Humidifier',
  hall_ventilation: 'Hall Ventilation',
  habitat_heater: 'Habitat Heater',
}

const ICONS = {
  cooling_fan: <FaRegSnowflake />,
  entrance_humidifier: <FaDroplet />,
  hall_ventilation: <FaWind />,
  habitat_heater: <FaFire />,
}

export default function ActuatorToggle({ actuatorId }) {
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(false)
  const [lastChanged, setLastChanged] = useState(null)

  const fetchState = () => {
    fetch(`${API}/api/actuators`)
      .then(r => r.json())
      .then(data => {
        const map = data.actuators ?? data
        if (Array.isArray(map)) {
          const found = map.find(a => a.id === actuatorId || a.name === actuatorId)
          if (found) setState(typeof found === 'string' ? found : (found.state ?? found.status ?? 'OFF'))
        } else if (map[actuatorId] !== undefined) {
          const found = map[actuatorId]
          setState(typeof found === 'string' ? found : (found.state ?? found.status ?? 'OFF'))
        }
      })
      .catch(() => { })
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
      if (resp.ok) {
        setState(next)
        setLastChanged(new Date())
      }
    } catch (_) { }
    setLoading(false)
  }

  const isOn = state === 'ON'

  return (
    <div className="actuator-card">
      <div style={{ fontSize: 24 }}>{ICONS[actuatorId] || '⚙️'}</div>
      <div className="actuator-label">{LABELS[actuatorId] || actuatorId}</div>
      <div className="toggle-container">
        <button
          className={`toggle-track${isOn ? ' on' : ''}`}
          onClick={toggle}
          disabled={loading || state === null}
          aria-label={`Toggle ${actuatorId}`}
        >
          <div className="toggle-thumb" />
        </button>
        <span className={`toggle-state-label ${isOn ? 'on' : 'off'}`}>
          {state ?? '…'}
        </span>
      </div>
      {lastChanged && (
        <div className="actuator-changed">Changed {lastChanged.toLocaleTimeString()}</div>
      )}
    </div>
  )
}
