/**
 * DemoTerminal — draggable, resizable floating terminal that streams
 * live pipeline events from /ws/logs and frontend-emitted actions.
 *
 * Color scheme per service:
 *   SIMULATOR  → #60a5fa  (blue)
 *   INGESTION  → #22d3ee  (cyan)
 *   KAFKA      → #a78bfa  (violet)
 *   PROCESSING → #86efac  (green)
 *   RULES      → #fbbf24  (amber)
 *   ACTUATOR   → #f87171  (red)
 *   WEBSOCKET  → #34d399  (emerald)
 *   FRONTEND   → #e879f9  (fuchsia)
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useLogStream } from '../hooks/useLogStream'

// ── Color maps ────────────────────────────────────────────────────────────────

const SVC_COLOR = {
  SIMULATOR:  '#60a5fa',
  INGESTION:  '#22d3ee',
  KAFKA:      '#a78bfa',
  PROCESSING: '#86efac',
  RULES:      '#fbbf24',
  ACTUATOR:   '#f87171',
  WEBSOCKET:  '#34d399',
  FRONTEND:   '#e879f9',
}

const LVL_COLOR = {
  INFO:    '#c9d1d9',
  SUCCESS: '#86efac',
  WARN:    '#fbbf24',
  ERROR:   '#f87171',
  DEBUG:   '#4a5568',
}

const LVL_PREFIX = {
  ERROR:   '✖',
  WARN:    '▲',
  SUCCESS: '✔',
  DEBUG:   '·',
}

function svcColor(s)  { return SVC_COLOR[(s || '').toUpperCase()]  || '#c9d1d9' }
function lvlColor(l)  { return LVL_COLOR[(l || '').toUpperCase()]  || '#c9d1d9' }
function lvlPrefix(l) { return LVL_PREFIX[(l || '').toUpperCase()] || '›' }

function fmtTime(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return '--:--:--' }
}

// ── Component ─────────────────────────────────────────────────────────────────

const DEFAULT_W = 720
const DEFAULT_H = 440

export default function DemoTerminal({ onClose }) {
  const { entries, connected, clear } = useLogStream()

  const [pos,       setPos]       = useState({ x: 40, y: 72 })
  const [size,      setSize]      = useState({ w: DEFAULT_W, h: DEFAULT_H })
  const [minimized, setMinimized] = useState(false)
  const [autoScroll,setAutoScroll]= useState(true)
  const [filter,    setFilter]    = useState('')

  const bodyRef   = useRef(null)
  const dragState = useRef(null)
  const resizeState = useRef(null)

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoScroll && bodyRef.current && !minimized) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [entries, autoScroll, minimized])

  const handleBodyScroll = () => {
    if (!bodyRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = bodyRef.current
    setAutoScroll(scrollTop + clientHeight >= scrollHeight - 16)
  }

  // ── Drag (title bar) ───────────────────────────────────────────────────────
  const onTitleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragState.current = { ox: e.clientX - pos.x, oy: e.clientY - pos.y }

    const onMove = (ev) => {
      if (!dragState.current) return
      setPos({
        x: Math.max(0, ev.clientX - dragState.current.ox),
        y: Math.max(0, ev.clientY - dragState.current.oy),
      })
    }
    const onUp = () => {
      dragState.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [pos])

  // ── Resize (bottom-right handle) ──────────────────────────────────────────
  const onResizeMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    resizeState.current = { x0: e.clientX, y0: e.clientY, w0: size.w, h0: size.h }

    const onMove = (ev) => {
      if (!resizeState.current) return
      setSize({
        w: Math.max(480, resizeState.current.w0 + ev.clientX - resizeState.current.x0),
        h: Math.max(220, resizeState.current.h0 + ev.clientY - resizeState.current.y0),
      })
    }
    const onUp = () => {
      resizeState.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [size])

  // ── Filtered entries ───────────────────────────────────────────────────────
  const filtered = filter.trim()
    ? entries.filter(e =>
        (e.message  || '').toLowerCase().includes(filter.toLowerCase()) ||
        (e.service  || '').toLowerCase().includes(filter.toLowerCase())
      )
    : entries

  // ── Styles ────────────────────────────────────────────────────────────────
  const S = {
    root: {
      position: 'fixed',
      left: pos.x,
      top:  pos.y,
      width:  minimized ? 340 : size.w,
      height: minimized ? 'auto' : size.h,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      borderRadius: 10,
      overflow: 'hidden',
      background: '#0d1117',
      boxShadow: '0 32px 80px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.08)',
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: 12,
      userSelect: 'none',
    },
    titleBar: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '8px 12px',
      background: '#161b22',
      borderBottom: '1px solid rgba(255,255,255,.07)',
      cursor: 'grab',
      flexShrink: 0,
    },
    dot: (color, title) => ({
      width: 12, height: 12, borderRadius: '50%',
      background: color, cursor: 'pointer', flexShrink: 0,
      title,
    }),
    titleText: {
      flex: 1, fontSize: 11, color: '#8b949e',
      letterSpacing: '.06em', paddingLeft: 6,
      pointerEvents: 'none',
      fontFamily: '"Courier New", Courier, monospace',
    },
    connBadge: {
      display: 'flex', alignItems: 'center', gap: 5,
      fontSize: 10, color: connected ? '#3fb950' : '#f85149',
      fontFamily: '"Courier New", Courier, monospace',
    },
    connDot: {
      width: 7, height: 7, borderRadius: '50%',
      background: connected ? '#3fb950' : '#f85149',
    },
    toolbar: {
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 10px',
      background: '#0d1117',
      borderBottom: '1px solid rgba(255,255,255,.05)',
      flexShrink: 0,
    },
    filterLabel: { color: '#484f58', fontSize: 10 },
    filterInput: {
      flex: 1,
      background: 'rgba(255,255,255,.05)',
      border: '1px solid rgba(255,255,255,.09)',
      borderRadius: 4, color: '#c9d1d9',
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: 11, padding: '2px 7px', outline: 'none',
    },
    tbBtn: {
      background: 'none',
      border: '1px solid rgba(255,255,255,.12)',
      borderRadius: 4, color: '#8b949e', fontSize: 10,
      padding: '2px 8px', cursor: 'pointer',
      fontFamily: '"Courier New", Courier, monospace',
      flexShrink: 0,
    },
    body: {
      flex: 1, overflowY: 'auto',
      padding: '6px 0', background: '#0d1117',
      scrollbarWidth: 'thin',
      scrollbarColor: '#21262d transparent',
    },
    emptyMsg: {
      color: '#3d444d', padding: '10px 14px', fontSize: 11, fontStyle: 'italic',
    },
    row: {
      display: 'flex', alignItems: 'flex-start',
      padding: '1px 12px', gap: 6, lineHeight: 1.6,
    },
    ts: {
      color: '#3d444d', flexShrink: 0, fontSize: 10,
      width: 60, paddingTop: 1,
    },
    badge: (color) => ({
      color, flexShrink: 0, width: 88, fontSize: 10,
      fontWeight: 700, letterSpacing: '.04em',
      textTransform: 'uppercase', paddingTop: 1,
    }),
    pfx: (color) => ({
      color, flexShrink: 0, width: 12, paddingTop: 1,
    }),
    msg: (color) => ({
      color, flex: 1, wordBreak: 'break-word',
      userSelect: 'text',
    }),
    footer: {
      display: 'flex', alignItems: 'center',
      padding: '4px 12px', gap: 4,
      background: '#161b22',
      borderTop: '1px solid rgba(255,255,255,.06)',
      flexShrink: 0,
    },
    prompt:  { color: '#3fb950', fontSize: 11 },
    cursor:  {
      display: 'inline-block', width: 7, height: 13,
      background: '#c9d1d9', marginLeft: 3,
      verticalAlign: 'middle',
      animation: 'term-blink 1s step-end infinite',
    },
    count: { marginLeft: 'auto', color: '#3d444d', fontSize: 10 },
    resizeHandle: {
      position: 'absolute', right: 0, bottom: 0,
      width: 16, height: 16, cursor: 'nwse-resize',
      background: 'linear-gradient(135deg, transparent 50%, #30363d 50%)',
    },
  }

  return (
    <>
      <style>{`
        @keyframes term-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .term-body::-webkit-scrollbar { width: 5px; }
        .term-body::-webkit-scrollbar-track { background: transparent; }
        .term-body::-webkit-scrollbar-thumb { background: #21262d; border-radius: 3px; }
        .term-row:hover { background: rgba(255,255,255,.02); }
      `}</style>

      <div style={S.root}>

        {/* ── Title bar ────────────────────────────────────────────────── */}
        <div style={S.titleBar} onMouseDown={onTitleMouseDown}>
          {/* Traffic-light buttons */}
          <div style={S.dot('#f87171')}   onClick={onClose}                         title="Close" />
          <div style={S.dot('#fbbf24')}   onClick={() => setMinimized(m => !m)}     title="Minimise / restore" />
          <div style={S.dot('#3fb950')}   onClick={() => { setAutoScroll(true); if (bodyRef.current) bodyRef.current.scrollTop = 9e9 }} title="Scroll to bottom" />

          <span style={S.titleText}>MARS HABITAT  ·  Pipeline Monitor</span>

          <span style={S.connBadge}>
            <span style={S.connDot} />
            {connected ? 'CONNECTED' : 'OFFLINE'}
          </span>
        </div>

        {!minimized && (
          <>
            {/* ── Toolbar ──────────────────────────────────────────────── */}
            <div style={S.toolbar}>
              <span style={S.filterLabel}>filter:</span>
              <input
                style={S.filterInput}
                placeholder="service or keyword…"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                onMouseDown={e => e.stopPropagation()}
              />
              <button style={S.tbBtn} onClick={clear}>CLEAR</button>
              <button
                style={{ ...S.tbBtn, color: autoScroll ? '#3fb950' : '#8b949e' }}
                onClick={() => { setAutoScroll(true); if (bodyRef.current) bodyRef.current.scrollTop = 9e9 }}
              >
                TAIL ▼
              </button>
            </div>

            {/* ── Log body ─────────────────────────────────────────────── */}
            <div
              ref={bodyRef}
              style={S.body}
              className="term-body"
              onScroll={handleBodyScroll}
            >
              {filtered.length === 0 && (
                <div style={S.emptyMsg}>Waiting for pipeline events…</div>
              )}

              {filtered.map((entry) => {
                const sc  = svcColor(entry.service)
                const lc  = lvlColor(entry.level)
                const pfx = lvlPrefix(entry.level)
                const svc = (entry.service || 'SYSTEM').toUpperCase().slice(0, 10).padEnd(10)
                return (
                  <div key={entry._id} style={S.row} className="term-row">
                    <span style={S.ts}>{fmtTime(entry.timestamp)}</span>
                    <span style={S.badge(sc)}>[{svc}]</span>
                    <span style={S.pfx(lc)}>{pfx}</span>
                    <span style={S.msg(lc)}>{entry.message}</span>
                  </div>
                )
              })}
            </div>

            {/* ── Footer prompt ────────────────────────────────────────── */}
            <div style={S.footer}>
              <span style={S.prompt}>mars@habitat:~$</span>
              <span style={S.cursor} />
              <span style={S.count}>{filtered.length} events</span>
            </div>

            {/* ── Resize handle ────────────────────────────────────────── */}
            <div style={S.resizeHandle} onMouseDown={onResizeMouseDown} />
          </>
        )}
      </div>
    </>
  )
}
