import React from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import SensorWidget from './components/SensorWidget'
import ActuatorToggle from './components/ActuatorToggle'
import RuleManager from './components/RuleManager'

const REST_SENSORS = [
  'greenhouse_temperature','entrance_humidity','co2_hall','corridor_pressure',
  'water_tank_level','hydroponic_ph','air_quality_pm25','air_quality_voc',
]
const TELEMETRY_SENSORS = [
  'solar_array','radiation','life_support','thermal_loop',
  'power_bus','power_consumption','airlock',
]
const ACTUATORS = ['cooling_fan','entrance_humidifier','hall_ventilation','habitat_heater']

export default function App() {
  const state = useWebSocket()

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <span style={styles.logo}>🔴 MARS HABITAT</span>
        <span style={styles.subtitle}>Automation & Monitoring Platform — 2036</span>
      </header>

      <main style={styles.main}>

        {/* REST Sensors */}
        <section>
          <h2 style={styles.sectionTitle}>REST Sensors</h2>
          <div style={styles.grid}>
            {REST_SENSORS.map(id => (
              <SensorWidget key={id} sensorId={id} event={state[id]} />
            ))}
          </div>
        </section>

        {/* Telemetry Streams */}
        <section>
          <h2 style={styles.sectionTitle}>Telemetry Streams</h2>
          <div style={styles.grid}>
            {TELEMETRY_SENSORS.map(id => (
              <SensorWidget key={id} sensorId={id} event={state[id]} />
            ))}
          </div>
        </section>

        {/* Actuators */}
        <section>
          <h2 style={styles.sectionTitle}>Actuators</h2>
          <div style={styles.row}>
            {ACTUATORS.map(id => (
              <ActuatorToggle key={id} actuatorId={id} />
            ))}
          </div>
        </section>

        {/* Rules */}
        <section>
          <h2 style={styles.sectionTitle}>Automation Rules</h2>
          <RuleManager />
        </section>

      </main>
    </div>
  )
}

const styles = {
  root: { minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  header: {
    background: '#060d1a',
    borderBottom: '1px solid #1e3a5f',
    padding: '14px 32px',
    display: 'flex',
    alignItems: 'center',
    gap: 20,
  },
  logo: { fontSize: 18, fontWeight: 'bold', color: '#7dd3fc', letterSpacing: 2 },
  subtitle: { fontSize: 12, color: '#4b6a80' },
  main: { padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 36 },
  sectionTitle: {
    fontSize: 11, color: '#4b6a80', textTransform: 'uppercase',
    letterSpacing: 2, marginBottom: 14,
  },
  grid: { display: 'flex', flexWrap: 'wrap', gap: 12 },
  row:  { display: 'flex', flexWrap: 'wrap', gap: 12 },
}
