import React, { useState, useEffect, useCallback } from 'react'

export default function AlertToast({ alerts = [] }) {
    const [visible, setVisible] = useState([])

    useEffect(() => {
        if (alerts.length === 0) return
        const latest = alerts[alerts.length - 1]
        // Avoid duplicate toasts for the same alert
        const id = `${latest.rule_id}-${latest.fired_at}`
        setVisible(prev => {
            if (prev.some(t => t.id === id)) return prev
            return [...prev, { ...latest, id, leaving: false }]
        })
    }, [alerts])

    // Auto-dismiss after 8 seconds
    useEffect(() => {
        if (visible.length === 0) return
        const timer = setTimeout(() => {
            dismiss(visible[0].id)
        }, 8000)
        return () => clearTimeout(timer)
    }, [visible])

    const dismiss = useCallback((id) => {
        setVisible(prev =>
            prev.map(t => t.id === id ? { ...t, leaving: true } : t)
        )
        setTimeout(() => {
            setVisible(prev => prev.filter(t => t.id !== id))
        }, 300)
    }, [])

    if (visible.length === 0) return null

    return (
        <div className="toast-container">
            {visible.slice(0, 5).map(alert => (
                <div key={alert.id} className={`toast${alert.leaving ? ' leaving' : ''}`}>
                    <span className="toast-icon">⚡</span>
                    <div className="toast-body">
                        <div className="toast-title">Rule Activated</div>
                        <div className="toast-msg">
                            IF <b>{alert.sensor_id}</b> {alert.operator} <b>{alert.threshold}</b>
                            {' → '}<b>{alert.actuator_id}</b> {alert.action}
                            <br />
                            <span style={{ color: 'var(--text-muted)' }}>
                                Sensor value: {alert.sensor_value}
                            </span>
                        </div>
                    </div>
                    <button className="toast-close" onClick={() => dismiss(alert.id)}>✕</button>
                </div>
            ))}
        </div>
    )
}
