import React from 'react'

const NAV = [
    {
        section: 'Monitoring', items: [
            { id: 'overview', icon: '📊', label: 'Overview' },
            { id: 'sensors', icon: '🌡️', label: 'Sensors' },
            { id: 'actuators', icon: '⚙️', label: 'Actuators' },
        ]
    },
    {
        section: 'Automation', items: [
            { id: 'rules', icon: '🔗', label: 'Rules' },
            { id: 'alerts', icon: '🔔', label: 'Alerts' },
        ]
    },
]

export default function Sidebar({ activeTab, onTabChange, alertCount = 0 }) {
    return (
        <aside className="sidebar">
            <div className="sidebar-brand">
                <div className="brand-icon">🔴</div>
                <div>
                    <div className="brand-text">MARS HABITAT</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>IoT Platform</div>
                </div>
            </div>

            {NAV.map(sec => (
                <div className="sidebar-section" key={sec.section}>
                    <div className="sidebar-section-label">{sec.section}</div>
                    {sec.items.map(item => (
                        <button
                            key={item.id}
                            className={`sidebar-item${activeTab === item.id ? ' active' : ''}`}
                            onClick={() => onTabChange(item.id)}
                        >
                            <span className="item-icon">{item.icon}</span>
                            {item.label}
                            {item.id === 'alerts' && alertCount > 0 && (
                                <span className="badge">{alertCount}</span>
                            )}
                        </button>
                    ))}
                </div>
            ))}

            <div style={{ marginTop: 'auto', padding: 20, borderTop: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                    Environment
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Mars Ops · 2036</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Sol 487 · Active</div>
            </div>
        </aside>
    )
}
