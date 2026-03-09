import React from 'react'

export default function EventLog({ events = [] }) {
    const recent = events.slice(0, 20)

    return (
        <div className="event-log">
            <div className="log-title">Sensor Event Log</div>
            {recent.length === 0 ? (
                <p className="empty-state">No events received yet.</p>
            ) : (
                <table className="log-table">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Type</th>
                            <th>Sensor</th>
                            <th>Value</th>
                            <th>Unit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {recent.map((ev, i) => {
                            const ts = ev.timestamp
                                ? new Date(ev.timestamp).toLocaleTimeString()
                                : '—'
                            const sourceClass = ev.source_type === 'REST'
                                ? 'badge-rest'
                                : 'badge-telemetry'
                            return (
                                <tr key={`${ev.event_id || ev.sensor_id}-${i}`}>
                                    <td>{ts}</td>
                                    <td>
                                        <span className={`badge-cell ${sourceClass}`}>
                                            {ev.source_type || '—'}
                                        </span>
                                    </td>
                                    <td style={{ color: 'var(--text-primary)' }}>{ev.sensor_id}</td>
                                    <td style={{ fontWeight: 600 }}>
                                        {ev.value != null ? Number(ev.value).toFixed(2) : '—'}
                                    </td>
                                    <td>{ev.unit || '—'}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            )}
        </div>
    )
}
