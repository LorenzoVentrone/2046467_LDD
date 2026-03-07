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

const EMPTY = { sensor_id: SENSORS[0], operator: '>', threshold: '', unit: '', actuator_id: ACTUATORS[0], action: 'ON' }

export default function RuleManager() {
  const [rules, setRules] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')

  const load = () =>
    fetch(`${API}/api/rules`).then(r => r.json()).then(setRules).catch(() => { })

  useEffect(() => { load() }, [])

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
    setForm(EMPTY)
    load()
  }

  const remove = async (id) => {
    await fetch(`${API}/api/rules/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="rule-manager">
      <div className="rule-title">Automation Rules</div>

      {/* Create form */}
      <form onSubmit={submit} className="rule-form">
        <span className="form-label">IF</span>
        <select value={form.sensor_id} onChange={e => setForm(f => ({ ...f, sensor_id: e.target.value }))}>
          {SENSORS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={form.operator} onChange={e => setForm(f => ({ ...f, operator: e.target.value }))} style={{ width: 60 }}>
          {OPERATORS.map(o => <option key={o}>{o}</option>)}
        </select>
        <input
          type="number" step="any" placeholder="value"
          value={form.threshold} onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))}
          style={{ width: 90 }} required
        />
        <input
          type="text" placeholder="unit (opt)"
          value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
          style={{ width: 80 }}
        />
        <span className="form-label">THEN</span>
        <select value={form.actuator_id} onChange={e => setForm(f => ({ ...f, actuator_id: e.target.value }))}>
          {ACTUATORS.map(a => <option key={a}>{a}</option>)}
        </select>
        <select value={form.action} onChange={e => setForm(f => ({ ...f, action: e.target.value }))} style={{ width: 70 }}>
          <option>ON</option><option>OFF</option>
        </select>
        <button type="submit" className="btn-add">Add Rule</button>
        {error && <span className="form-error">{error}</span>}
      </form>

      {/* Rules list */}
      <div className="rule-list">
        {rules.length === 0 && <p className="empty-state">No rules defined.</p>}
        {rules.map(r => (
          <div key={r.id} className="rule-item">
            <span className="rule-text">
              IF <b>{r.sensor_id}</b> {r.operator} <b>{r.threshold}</b>{r.unit ? ` ${r.unit}` : ''}
              {' '}→ <b>{r.actuator_id}</b> {r.action}
            </span>
            <button onClick={() => remove(r.id)} className="btn-delete" title="Delete rule">✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}
