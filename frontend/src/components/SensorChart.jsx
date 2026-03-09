import React, { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const CHART_COLORS = {
  primary:   '#d95f3b',
  secondary: '#3b82f6',
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
      <div className="chart-title">{title}</div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={fill} stopOpacity={0.18} />
              <stop offset="95%" stopColor={fill} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="time"
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            axisLine={{ stroke: '#e5e7eb' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            axisLine={{ stroke: '#e5e7eb' }}
            tickLine={false}
            width={45}
          />
          <Tooltip
            contentStyle={{
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              fontSize: 12,
              color: '#111827',
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            }}
            formatter={(v) => [`${Number(v).toFixed(2)} ${unit}`, dataKey]}
            labelStyle={{ color: '#6b7280', marginBottom: 2 }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={fill}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, fill, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
