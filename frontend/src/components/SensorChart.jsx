import React, { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const CHART_COLORS = {
  primary:   '#d95f3b',
  secondary: '#3b82f6',
}

export default function SensorChart({ title, history = [], dataKey = 'value', color, unit = '', theme = 'light' }) {
  const fill = color || CHART_COLORS.primary
  const gradientId = `grad-${title?.replace(/\s/g, '') || 'default'}`
  const dark = theme === 'dark'

  const gridColor    = dark ? 'rgba(255,255,255,0.06)' : '#e5e7eb'
  const axisColor    = dark ? 'rgba(255,255,255,0.06)' : '#e5e7eb'
  const tickColor    = dark ? '#5c5f73'                : '#9ca3af'
  const tooltipBg    = dark ? '#16171f'                : '#ffffff'
  const tooltipBorder= dark ? '#2c2d3a'                : '#e5e7eb'
  const tooltipText  = dark ? '#e8eaed'                : '#111827'
  const tooltipLabel = dark ? '#8b8fa3'                : '#6b7280'

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
              <stop offset="5%"  stopColor={fill} stopOpacity={dark ? 0.3 : 0.18} />
              <stop offset="95%" stopColor={fill} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="time"
            tick={{ fill: tickColor, fontSize: 10 }}
            axisLine={{ stroke: axisColor }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: tickColor, fontSize: 10 }}
            axisLine={{ stroke: axisColor }}
            tickLine={false}
            width={45}
          />
          <Tooltip
            contentStyle={{
              background: tooltipBg,
              border: `1px solid ${tooltipBorder}`,
              borderRadius: 8,
              fontSize: 12,
              color: tooltipText,
              boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 4px 16px rgba(0,0,0,0.08)',
            }}
            formatter={(v) => [`${Number(v).toFixed(2)} ${unit}`, dataKey]}
            labelStyle={{ color: tooltipLabel, marginBottom: 2 }}
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
