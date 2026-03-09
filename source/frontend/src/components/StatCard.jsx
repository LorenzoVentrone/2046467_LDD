import React from 'react'

export default function StatCard({ label, value, unit, badge, badgeType, subtitle }) {
    return (
        <div className="stat-card">
            <div className="stat-label">
                {label}
                {badge && (
                    <span className={`stat-badge ${badgeType || 'up'}`}>
                        {badge}
                    </span>
                )}
            </div>
            <div className="stat-value">
                {value ?? '—'}
                {unit && <span className="stat-unit">{unit}</span>}
            </div>
            {subtitle && <div className="stat-sub">{subtitle}</div>}
        </div>
    )
}
