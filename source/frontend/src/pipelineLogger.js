/**
 * Module-level event bus for frontend-originated pipeline log entries.
 *
 * Components call emitPipelineLog() to inject UI events into the DemoTerminal
 * without needing React context or props drilling.
 *
 * Usage:
 *   import { emitPipelineLog } from '../pipelineLogger'
 *   emitPipelineLog({ service: 'FRONTEND', message: '► User toggled cooling_fan → ON' })
 */

const _listeners = new Set()

/** Subscribe to frontend pipeline events. Returns an unsubscribe function. */
export function onPipelineLog(fn) {
  _listeners.add(fn)
  return () => _listeners.delete(fn)
}

/** Emit a pipeline log entry from the frontend (e.g. actuator toggle, rule save). */
export function emitPipelineLog({ service = 'FRONTEND', message, level = 'INFO' }) {
  const entry = {
    type: 'pipeline_log',
    service: service.toUpperCase(),
    message,
    level: level.toUpperCase(),
    timestamp: new Date().toISOString(),
    _local: true,   // marks this as a frontend-only event (not from backend WS)
  }
  _listeners.forEach(fn => fn(entry))
}
