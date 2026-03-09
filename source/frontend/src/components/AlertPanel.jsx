import React, { useEffect, useState } from 'react'

const API = import.meta.env.VITE_API_URL || ''

export default function AlertPanel({ liveAlerts = [] }) {
    const [logs, setLogs] = useState([])

    useEffect(() => {
        fetch(`${API}/api/rules/log?limit=50`)
            .then(r => r.json())
            .then(data => setLogs(Array.isArray(data) ? data : []))
            .catch(() => { })
    }, [])

    // Merge live alerts with persisted logs (live first, then historical)
    const allAlerts = [
        ...liveAlerts.slice().reverse(),
        ...logs.filter(log =>
            !liveAlerts.some(a => a.rule_id === log.rule_id && a.fired_at === log.fired_at)
        ),
    ]

    return (
        <div>
            <h2 className="section-title" style={{ marginBottom: 16 }}>Alert History</h2>
            {allAlerts.length === 0 ? (
                <p className="empty-state">No rule alerts recorded yet.</p>
            ) : (
                <div className="alert-panel">
                    {allAlerts.map((alert, i) => {
                        const time = alert.fired_at
                            ? new Date(alert.fired_at).toLocaleString()
                            : '—'
                        return (
                            <div className="alert-entry" key={`${alert.rule_id}-${alert.fired_at}-${i}`}>
                                <div className="alert-time">{time}</div>
                                <div className="alert-desc">
                                    IF <b>{alert.sensor_id}</b> {alert.operator} <b>{alert.threshold}</b>
                                    {' '}(value: {alert.sensor_value})
                                </div>
                                <div className="alert-action">
                                    → {alert.actuator_id} set to {alert.action}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
