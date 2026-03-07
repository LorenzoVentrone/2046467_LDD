import React, { useMemo } from 'react'
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const CHART_COLORS = {
    primary: '#7c5cfc',
    secondary: '#60a5fa',
}

export default function SensorChart({ title, history = [], dataKey = 'value', color, unit = '' }) {
    const fill = color || CHART_COLORS.primary
    const gradientId = `grad-${title?.replace(/\s/g, '') || 'default'}`

    const data = useMemo(() => {
        return history.map((point, i) => ({
            ...point,
            time: point.timestamp
                ? new Date(point.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : `${i}`,
        }))
    }, [history])

    return (
        <div className="chart-card">
            <div className="chart-title">
                {title}
            </div>
            <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data}>
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={fill} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={fill} stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                        dataKey="time"
                        tick={{ fill: '#5c5f73', fontSize: 10 }}
                        axisLine={{ stroke: '#23243080' }}
                        tickLine={false}
                    />
                    <YAxis
                        tick={{ fill: '#5c5f73', fontSize: 10 }}
                        axisLine={{ stroke: '#23243080' }}
                        tickLine={false}
                        width={45}
                    />
                    <Tooltip
                        contentStyle={{
                            background: '#16171f',
                            border: '1px solid #23243080',
                            borderRadius: 8,
                            fontSize: 12,
                            color: '#e8eaed',
                        }}
                        formatter={(v) => [`${Number(v).toFixed(2)} ${unit}`, dataKey]}
                        labelStyle={{ color: '#8b8fa3' }}
                    />
                    <Area
                        type="monotone"
                        dataKey={dataKey}
                        stroke={fill}
                        strokeWidth={2}
                        fill={`url(#${gradientId})`}
                        dot={false}
                        activeDot={{ r: 4, fill }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    )
}
