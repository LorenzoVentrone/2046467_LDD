import React, { useState } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import Sidebar from './components/Sidebar'
import StatCard from './components/StatCard'
import SensorWidget from './components/SensorWidget'
import SensorChart from './components/SensorChart'
import ActuatorToggle from './components/ActuatorToggle'
import RuleManager from './components/RuleManager'
import EventLog from './components/EventLog'
import AlertToast from './components/AlertToast'
import AlertPanel from './components/AlertPanel'

const REST_SENSORS = [
  'greenhouse_temperature', 'entrance_humidity', 'co2_hall', 'corridor_pressure',
  'water_tank_level', 'hydroponic_ph', 'air_quality_pm25', 'air_quality_voc',
]
const TELEMETRY_SENSORS = [
  'solar_array', 'radiation', 'life_support', 'thermal_loop',
  'power_bus', 'power_consumption', 'airlock',
]
const ACTUATORS = ['cooling_fan', 'entrance_humidifier', 'hall_ventilation', 'habitat_heater']

const TABS = {
  overview: 'Overview',
  sensors: 'Sensors',
  actuators: 'Actuators',
  rules: 'Rules',
  alerts: 'Alerts',
}

const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M11.89 4.11l1.06-1.06M3.05 12.95l1.06-1.06" />
  </svg>
)

const MoonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M13.5 10.5A6 6 0 0 1 5.5 2.5a6 6 0 1 0 8 8z" />
  </svg>
)

const BellIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5v3.5l1 1.5H2.5L3.5 9.5V6A4.5 4.5 0 0 1 8 1.5z" />
    <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
  </svg>
)

const BellOffIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5v3.5l1 1.5H2.5L3.5 9.5V6A4.5 4.5 0 0 1 8 1.5z" />
    <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
    <line x1="2" y1="2" x2="14" y2="14" />
  </svg>
)

export default function App() {
  const { sensorState, sensorHistory, alerts, eventLog, connected } = useWebSocket()
  const [activeTab, setActiveTab] = useState('overview')
  const [theme, setTheme] = useState(() => localStorage.getItem('mars-theme') || 'light')
  const [dnd, setDnd] = useState(() => localStorage.getItem('mars-dnd') === 'true')

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    localStorage.setItem('mars-theme', next)
  }

  const toggleDnd = () => {
    const next = !dnd
    setDnd(next)
    localStorage.setItem('mars-dnd', String(next))
  }

  const temp     = sensorState.greenhouse_temperature
  const humidity = sensorState.entrance_humidity
  const co2      = sensorState.co2_hall
  const pressure = sensorState.corridor_pressure

  return (
    <div className="app-layout" data-theme={theme}>
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        alertCount={alerts.length}
      />

      <div className="main-area">
        {/* Header */}
        <div className="main-header">
          <div>
            <h1>Monitoring Dashboard</h1>
            <div className="header-sub">
              Last updated: {new Date().toLocaleTimeString()} · {Object.keys(sensorState).length} sensors active
            </div>
          </div>
          {/* Header controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              className={`dnd-btn${dnd ? ' dnd-btn--active' : ''}`}
              onClick={toggleDnd}
              title={dnd ? 'Do not disturb: ON — click to enable alerts' : 'Do not disturb: OFF — click to silence alerts'}
            >
              {dnd ? <BellOffIcon /> : <BellIcon />}
            </button>
            <button className="theme-toggle" onClick={toggleTheme} title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
              {theme === 'light' ? <MoonIcon /> : <SunIcon />}
            </button>
            <div className={`conn-badge${connected ? ' conn-badge--live' : ' conn-badge--reconnecting'}`}>
              <span className="conn-dot" />
              {connected ? 'LIVE' : 'RECONNECTING'}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="tab-bar">
          {Object.entries(TABS).map(([id, label]) => (
            <button
              key={id}
              className={`tab-btn${activeTab === id ? ' active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="main-content">

          {/* ── OVERVIEW ─────────────────────────────────── */}
          {activeTab === 'overview' && (
            <>
              <div className="stat-grid">
                <StatCard
                  label="Greenhouse Temp"
                  value={temp ? Number(temp.value).toFixed(1) : null}
                  unit="°C"
                  badge={temp ? (Number(temp.value) > 28 ? '⚠ HIGH' : '✓') : null}
                  badgeType={temp && Number(temp.value) > 28 ? 'warn' : 'up'}
                  subtitle="Real-time"
                />
                <StatCard
                  label="Entrance Humidity"
                  value={humidity ? Number(humidity.value).toFixed(1) : null}
                  unit="%"
                  badge={humidity ? (Number(humidity.value) < 30 ? '⚠ LOW' : '✓') : null}
                  badgeType={humidity && Number(humidity.value) < 30 ? 'warn' : 'up'}
                  subtitle="Real-time"
                />
                <StatCard
                  label="CO₂ Hall"
                  value={co2 ? Number(co2.value).toFixed(0) : null}
                  unit="ppm"
                  badge={co2 ? (Number(co2.value) > 1000 ? '⚠ DANGER' : '✓') : null}
                  badgeType={co2 && Number(co2.value) > 1000 ? 'down' : 'up'}
                  subtitle="Real-time"
                />
                <StatCard
                  label="Corridor Pressure"
                  value={pressure ? Number(pressure.value).toFixed(1) : null}
                  unit="kPa"
                  badge="✓"
                  badgeType="up"
                  subtitle="Real-time"
                />
              </div>

              <div className="chart-grid">
                <SensorChart
                  title="Thermal Loop Temperature"
                  history={sensorHistory.thermal_loop || []}
                  unit="°C"
                  theme={theme}
                />
                <SensorChart
                  title="Power Bus"
                  history={sensorHistory.power_bus || []}
                  color="#60a5fa"
                  unit="W"
                  theme={theme}
                />
              </div>

              <EventLog events={eventLog} />
            </>
          )}

          {/* ── SENSORS ──────────────────────────────────── */}
          {activeTab === 'sensors' && (
            <>
              <h2 className="section-title">REST Sensors</h2>
              <div className="sensor-grid">
                {REST_SENSORS.map(id => (
                  <SensorWidget key={id} sensorId={id} event={sensorState[id]} />
                ))}
              </div>

              <h2 className="section-title" style={{ marginTop: 24 }}>Telemetry Streams</h2>
              <div className="sensor-grid">
                {TELEMETRY_SENSORS.map(id => (
                  <SensorWidget key={id} sensorId={id} event={sensorState[id]} />
                ))}
              </div>

              <h2 className="section-title" style={{ marginTop: 24 }}>Live Charts</h2>
              <div className="chart-grid">
                <SensorChart title="Thermal Loop"           history={sensorHistory.thermal_loop || []}            unit="°C"  theme={theme} />
                <SensorChart title="Power Bus"              history={sensorHistory.power_bus || []}               color="#60a5fa" unit="W"   theme={theme} />
                <SensorChart title="Power Consumption"      history={sensorHistory.power_consumption || []}       color="#f59e0b" unit="W"   theme={theme} />
                <SensorChart title="Greenhouse Temperature" history={sensorHistory.greenhouse_temperature || []}  color="#22c55e" unit="°C"  theme={theme} />
              </div>
            </>
          )}

          {/* ── ACTUATORS ─────────────────────────────────── */}
          {activeTab === 'actuators' && (
            <>
              <h2 className="section-title">Actuator Controls</h2>
              <div className="actuator-grid">
                {ACTUATORS.map(id => (
                  <ActuatorToggle key={id} actuatorId={id} />
                ))}
              </div>
            </>
          )}

          {/* ── RULES ────────────────────────────────────── */}
          {activeTab === 'rules' && (
            <>
              <h2 className="section-title">Rule Engine</h2>
              <RuleManager />
            </>
          )}

          {/* ── ALERTS ───────────────────────────────────── */}
          {activeTab === 'alerts' && (
            <AlertPanel liveAlerts={alerts} />
          )}

        </div>
      </div>

      {/* Toast notifications — suppressed when do-not-disturb is on */}
      <AlertToast alerts={dnd ? [] : alerts} />
    </div>
  )
}
