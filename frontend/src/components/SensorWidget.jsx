import React from 'react'

const LABELS = {
  greenhouse_temperature: 'Greenhouse Temp',
  entrance_humidity:      'Entrance Humidity',
  co2_hall:               'CO₂ Hall',
  corridor_pressure:      'Corridor Pressure',
  water_tank_level:       'Water Tank',
  hydroponic_ph:          'Hydroponic pH',
  air_quality_pm25:       'PM2.5 Particulate',
  air_quality_voc:        'VOC',
  solar_array:            'Solar Array',
  radiation:              'Radiation',
  life_support:           'Life Support',
  thermal_loop:           'Thermal Loop',
  power_bus:              'Power Bus',
  power_consumption:      'Power Consumption',
  airlock:                'Airlock',
}

export default function SensorWidget({ sensorId, event }) {
  const label = LABELS[sensorId] || sensorId
  const hasData = !!event

  const ts = hasData
    ? new Date(event.timestamp).toLocaleTimeString()
    : null

  const displayValue = hasData
    ? sensorId === 'airlock'
      ? ['CLOSED', 'OPEN', 'CYCLING'][event.value] ?? event.value
      : `${Number(event.value).toFixed(2)} ${event.unit}`
    : '—'

  return (
    <div style={styles.card}>
      <div style={styles.label}>{label}</div>
      <div style={styles.value}>{displayValue}</div>
      {hasData && (
        <div style={styles.meta}>
          <span style={styles.tag}>{event.source_type}</span>
          <span style={styles.ts}>{ts}</span>
        </div>
      )}
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
    gap: 6,
    minWidth: 180,
  },
  label: { fontSize: 11, color: '#6b8fa8', textTransform: 'uppercase', letterSpacing: 1 },
  value: { fontSize: 22, fontWeight: 'bold', color: '#7dd3fc' },
  meta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  tag: {
    fontSize: 9, background: '#1e3a5f', color: '#7dd3fc',
    padding: '2px 6px', borderRadius: 4,
  },
  ts: { fontSize: 10, color: '#4b6a80' },
}
