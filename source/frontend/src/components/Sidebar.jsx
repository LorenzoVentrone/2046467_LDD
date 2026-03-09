import React from 'react'

/* ── Minimal SVG icons ───────────────────────────────────────────────── */
const Icon = {
  overview: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
      <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
    </svg>
  ),
  sensors: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="2" />
      <path d="M4.8 11.2a4.5 4.5 0 0 1 0-6.4M11.2 4.8a4.5 4.5 0 0 1 0 6.4" />
    </svg>
  ),
  actuators: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M11.2 4.8l-1.4 1.4M4.8 11.2l-1.4 1.4" />
    </svg>
  ),
  rules: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 4h12M2 8h8M2 12h10" />
    </svg>
  ),
  alerts: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5v3.5l1 1.5H2.5L3.5 9.5V6A4.5 4.5 0 0 1 8 1.5z" />
      <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
    </svg>
  ),
}

const BrandMark = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <circle cx="9" cy="9" r="9" fill="white" fillOpacity="0.2" />
    <circle cx="9" cy="9" r="5" fill="white" fillOpacity="0.9" />
    <circle cx="9" cy="9" r="2.5" fill="white" />
  </svg>
)

const NAV = [
  {
    section: 'Monitoring', items: [
      { id: 'overview',  icon: 'overview',  label: 'Overview' },
      { id: 'sensors',   icon: 'sensors',   label: 'Sensors' },
      { id: 'actuators', icon: 'actuators', label: 'Actuators' },
    ]
  },
  {
    section: 'Automation', items: [
      { id: 'rules',  icon: 'rules',  label: 'Rules' },
      { id: 'alerts', icon: 'alerts', label: 'Alerts' },
    ]
  },
]

export default function Sidebar({ activeTab, onTabChange, alertCount = 0 }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon">
          <BrandMark />
        </div>
        <div>
          <div className="brand-text">MARS HABITAT</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>IoT Platform</div>
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
              <span className="item-icon">{Icon[item.icon]}</span>
              {item.label}
              {item.id === 'alerts' && alertCount > 0 && (
                <span className="badge">{alertCount}</span>
              )}
            </button>
          ))}
        </div>
      ))}

      <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          Environment
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>Mars Ops · 2036</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Sol 487 · Active</div>
      </div>
    </aside>
  )
}
