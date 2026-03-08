import React, { useEffect, useState } from 'react'

const API = import.meta.env.VITE_API_URL || ''

const SENSORS = [
  'greenhouse_temperature', 'entrance_humidity', 'co2_hall', 'corridor_pressure',
  'water_tank_level', 'hydroponic_ph', 'air_quality_pm25', 'air_quality_voc',
  'solar_array', 'radiation', 'life_support', 'thermal_loop',
  'power_bus', 'power_consumption', 'airlock',
]
const ACTUATORS = ['cooling_fan', 'entrance_humidifier', 'hall_ventilation', 'habitat_heater']
const OPERATORS = ['<', '<=', '=', '>=', '>']

// Default units per sensor — auto-filled when sensor changes in the form
const SENSOR_UNITS = {
  greenhouse_temperature: '°C',
  entrance_humidity:      '%',
  co2_hall:               'ppm',
  corridor_pressure:      'Pa',
  water_tank_level:       '%',
  hydroponic_ph:          'pH',
  air_quality_pm25:       'μg/m³',
  air_quality_voc:        'ppb',
  solar_array:            'kW',
  radiation:              'μSv/h',
  thermal_loop:           '°C',
  power_bus:              'kW',
  power_consumption:      'kW',
  life_support:           '',
  airlock:                '',
}

const makeEmpty = () => ({
  sensor_id: SENSORS[0],
  operator: '>',
  threshold: '',
  unit: SENSOR_UNITS[SENSORS[0]] || '',
  actuator_id: ACTUATORS[0],
  action: 'ON',
})

export default function RuleManager() {
  const [rules, setRules] = useState([])
  const [form, setForm] = useState(makeEmpty())
  const [error, setError] = useState('')

  const permanentRules = rules.filter(r => r.permanent)
  const userRules = rules.filter(r => !r.permanent)

  const load = () =>
    fetch(`${API}/api/rules`).then(r => r.json()).then(setRules).catch(() => { })

  useEffect(() => { load() }, [])

  const handleSensorChange = (sensor_id) => {
    setForm(f => ({ ...f, sensor_id, unit: SENSOR_UNITS[sensor_id] ?? '' }))
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.threshold) return setError('Threshold is required')
    const body = { ...form, threshold: parseFloat(form.threshold) }
    const resp = await fetch(`${API}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!resp.ok) { setError(await resp.text()); return }
    setForm(makeEmpty())
    load()
  }

  const remove = async (id) => {
    const resp = await fetch(`${API}/api/rules/${id}`, { method: 'DELETE' })
    if (resp.status === 403) {
      setError('Cannot delete a permanent safety rule')
      return
    }
    load()
  }

  const ruleText = (r) => (
    <span className="rule-text">
      IF <b>{r.sensor_id}</b> {r.operator} <b>{r.threshold}</b>
      {r.unit ? <span className="rule-unit"> {r.unit}</span> : ''}
      {' '}→ <b>{r.actuator_id}</b>{' '}
      <span className={r.action === 'ON' ? 'action-on' : 'action-off'}>{r.action}</span>
    </span>
  )

  return (
    <div className="rule-manager">

      {/* Safety Rules (permanent) */}
      {permanentRules.length > 0 && (
        <div className="rule-section rule-section--permanent">
          <div className="rule-section-header">
            <span className="rule-lock-badge">🔒 SAFETY RULES</span>
            <span className="rule-section-hint">Always active — cannot be deleted</span>
          </div>
          <div className="rule-list">
            {permanentRules.map(r => (
              <div key={r.id} className="rule-item rule-item--permanent">
                {ruleText(r)}
                <span className="rule-locked-tag">PERMANENT</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom Rules */}
      <div className="rule-section">
        <div className="rule-title">Custom Rules</div>

        {/* Creation form */}
        <form onSubmit={submit} className="rule-form">
          <span className="form-label">IF</span>
          <select
            value={form.sensor_id}
            onChange={e => handleSensorChange(e.target.value)}
          >
            {SENSORS.map(s => <option key={s}>{s}</option>)}
          </select>
          <select
            value={form.operator}
            onChange={e => setForm(f => ({ ...f, operator: e.target.value }))}
            style={{ width: 60 }}
          >
            {OPERATORS.map(o => <option key={o}>{o}</option>)}
          </select>
          <input
            type="number" step="any" placeholder="value"
            value={form.threshold}
            onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))}
            style={{ width: 90 }} required
          />
          <input
            type="text" placeholder="unit"
            value={form.unit}
            onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
            style={{ width: 80 }}
            title="Unit is auto-filled based on the selected sensor"
          />
          <span className="form-label">THEN</span>
          <select
            value={form.actuator_id}
            onChange={e => setForm(f => ({ ...f, actuator_id: e.target.value }))}
          >
            {ACTUATORS.map(a => <option key={a}>{a}</option>)}
          </select>
          <select
            value={form.action}
            onChange={e => setForm(f => ({ ...f, action: e.target.value }))}
            style={{ width: 70 }}
          >
            <option>ON</option>
            <option>OFF</option>
          </select>
          <button type="submit" className="btn-add">+ Add</button>
          {error && <span className="form-error">{error}</span>}
        </form>

        {/* User rules list */}
        <div className="rule-list">
          {userRules.length === 0 && <p className="empty-state">No custom rules defined.</p>}
          {userRules.map(r => (
            <div key={r.id} className="rule-item">
              {ruleText(r)}
              <button onClick={() => remove(r.id)} className="btn-delete" title="Delete rule">✕</button>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
