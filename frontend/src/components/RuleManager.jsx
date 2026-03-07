import React, { useEffect, useState } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8001'

const SENSORS = [
  'greenhouse_temperature','entrance_humidity','co2_hall','corridor_pressure',
  'water_tank_level','hydroponic_ph','air_quality_pm25','air_quality_voc',
  'solar_array','radiation','life_support','thermal_loop',
  'power_bus','power_consumption','airlock',
]
const ACTUATORS = ['cooling_fan','entrance_humidifier','hall_ventilation','habitat_heater']
const OPERATORS = ['<','<=','=','>=','>']

const EMPTY = { sensor_id: SENSORS[0], operator: '>', threshold: '', unit: '', actuator_id: ACTUATORS[0], action: 'ON' }

export default function RuleManager() {
  const [rules, setRules]   = useState([])
  const [form, setForm]     = useState(EMPTY)
  const [error, setError]   = useState('')

  const load = () =>
    fetch(`${API}/api/rules`).then(r => r.json()).then(setRules).catch(() => {})

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
    <div style={styles.container}>
      <h3 style={styles.title}>Automation Rules</h3>

      {/* Create form */}
      <form onSubmit={submit} style={styles.form}>
        <span style={styles.label}>IF</span>
        <select value={form.sensor_id} onChange={e => setForm(f => ({ ...f, sensor_id: e.target.value }))} style={styles.sel}>
          {SENSORS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={form.operator} onChange={e => setForm(f => ({ ...f, operator: e.target.value }))} style={{ ...styles.sel, width: 60 }}>
          {OPERATORS.map(o => <option key={o}>{o}</option>)}
        </select>
        <input
          type="number" step="any" placeholder="value"
          value={form.threshold} onChange={e => setForm(f => ({ ...f, threshold: e.target.value }))}
          style={{ ...styles.sel, width: 90 }} required
        />
        <input
          type="text" placeholder="unit (opt)"
          value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
          style={{ ...styles.sel, width: 80 }}
        />
        <span style={styles.label}>THEN</span>
        <select value={form.actuator_id} onChange={e => setForm(f => ({ ...f, actuator_id: e.target.value }))} style={styles.sel}>
          {ACTUATORS.map(a => <option key={a}>{a}</option>)}
        </select>
        <select value={form.action} onChange={e => setForm(f => ({ ...f, action: e.target.value }))} style={{ ...styles.sel, width: 70 }}>
          <option>ON</option><option>OFF</option>
        </select>
        <button type="submit" style={styles.addBtn}>Add</button>
        {error && <span style={{ color: '#f87171', fontSize: 12 }}>{error}</span>}
      </form>

      {/* Rules list */}
      <div style={styles.list}>
        {rules.length === 0 && <p style={{ color: '#4b6a80', fontSize: 13 }}>No rules defined.</p>}
        {rules.map(r => (
          <div key={r.id} style={styles.rule}>
            <span style={styles.ruleText}>
              IF <b>{r.sensor_id}</b> {r.operator} <b>{r.threshold}</b>{r.unit ? ` ${r.unit}` : ''}
              {' '}→ <b>{r.actuator_id}</b> {r.action}
            </span>
            <button onClick={() => remove(r.id)} style={styles.delBtn}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

const styles = {
  container: { background: '#111827', border: '1px solid #1e3a5f', borderRadius: 8, padding: '18px 22px' },
  title: { fontSize: 13, color: '#7dd3fc', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1 },
  form: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 },
  label: { fontSize: 12, color: '#6b8fa8', fontWeight: 'bold' },
  sel: {
    background: '#1f2937', border: '1px solid #374151', color: '#c8d8e8',
    borderRadius: 4, padding: '4px 8px', fontSize: 12,
  },
  addBtn: {
    background: '#1d4ed8', border: 'none', color: '#fff',
    borderRadius: 4, padding: '5px 14px', cursor: 'pointer', fontSize: 12,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  rule: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#1f2937', borderRadius: 6, padding: '8px 12px',
  },
  ruleText: { fontSize: 13, color: '#c8d8e8' },
  delBtn: {
    background: 'transparent', border: 'none', color: '#f87171',
    cursor: 'pointer', fontSize: 14, padding: '0 4px',
  },
}
