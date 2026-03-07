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

export default function App() {
  const { sensorState, sensorHistory, alerts, eventLog } = useWebSocket()
  const [activeTab, setActiveTab] = useState('overview')

  // KPI values for stat cards
  const temp = sensorState.greenhouse_temperature
  const humidity = sensorState.entrance_humidity
  const co2 = sensorState.co2_hall
  const pressure = sensorState.corridor_pressure

  return (
    <div className="app-layout">
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
              {/* KPI Stat Cards */}
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

              {/* Charts */}
              <div className="chart-grid">
                <SensorChart
                  title="Thermal Loop Temperature"
                  history={sensorHistory.thermal_loop || []}
                  unit="°C"
                />
                <SensorChart
                  title="Power Bus"
                  history={sensorHistory.power_bus || []}
                  color="#60a5fa"
                  unit="W"
                />
              </div>

              {/* Event log */}
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

              {/* Telemetry Charts */}
              <h2 className="section-title" style={{ marginTop: 24 }}>Live Charts</h2>
              <div className="chart-grid">
                <SensorChart
                  title="Thermal Loop"
                  history={sensorHistory.thermal_loop || []}
                  unit="°C"
                />
                <SensorChart
                  title="Power Bus"
                  history={sensorHistory.power_bus || []}
                  color="#60a5fa"
                  unit="W"
                />
                <SensorChart
                  title="Power Consumption"
                  history={sensorHistory.power_consumption || []}
                  color="#f59e0b"
                  unit="W"
                />
                <SensorChart
                  title="Greenhouse Temperature"
                  history={sensorHistory.greenhouse_temperature || []}
                  color="#22c55e"
                  unit="°C"
                />
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

      {/* Toast notifications (always visible) */}
      <AlertToast alerts={alerts} />
    </div>
  )
}
