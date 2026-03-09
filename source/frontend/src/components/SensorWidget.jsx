import React from 'react'

const LABELS = {
  greenhouse_temperature: 'Greenhouse Temp',
  entrance_humidity: 'Entrance Humidity',
  co2_hall: 'CO₂ Hall',
  corridor_pressure: 'Corridor Pressure',
  water_tank_level: 'Water Tank',
  hydroponic_ph: 'Hydroponic pH',
  air_quality_pm25: 'PM2.5 Particulate',
  air_quality_voc: 'VOC',
  solar_array: 'Solar Array',
  radiation: 'Radiation',
  life_support: 'Life Support',
  thermal_loop: 'Thermal Loop',
  power_bus: 'Power Bus',
  power_consumption: 'Power Consumption',
  airlock: 'Airlock',
}

const UNITS = {
  greenhouse_temperature: '°C',
  entrance_humidity: '%',
  co2_hall: 'ppm',
  corridor_pressure: 'kPa',
  water_tank_level: '%',
  air_quality_pm25: 'µg/m³',
}

export default function SensorWidget({ sensorId, event }) {
  const label = LABELS[sensorId] || sensorId
  const hasData = !!event

  const ts = hasData
    ? new Date(event.timestamp).toLocaleTimeString()
    : null

  let displayValue = '—'
  if (hasData) {
    if (sensorId === 'airlock') {
      displayValue = ['CLOSED', 'OPEN', 'CYCLING'][event.value] ?? event.value
    } else {
      displayValue = Number(event.value).toFixed(2)
    }
  }

  const displayUnit = hasData
    ? (UNITS[sensorId] || event.unit || '')
    : ''

  // Determine status from metadata or default
  const status = event?.metadata?.status || (hasData ? 'ok' : null)

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-label">{label}</span>
        {status && (
          <span className={`status-dot ${status}`} title={status} />
        )}
      </div>
      <div className="card-value">
        {displayValue}
        {displayUnit && (
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 4 }}>
            {displayUnit}
          </span>
        )}
      </div>
      {hasData && (
        <div className="card-meta">
          <span className="card-tag">{event.source_type}</span>
          <span className="card-ts">{ts}</span>
        </div>
      )}
    </div>
  )
}
