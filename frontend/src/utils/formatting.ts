/**
 * Shared formatting utilities for ROS Trace Proxy frontend.
 */

export function latencyColor(ms: number): string {
  if (ms < 10) return 'text-green-400'
  if (ms < 50) return 'text-yellow-400'
  if (ms < 200) return 'text-orange-400'
  return 'text-red-400'
}

export function latencyBg(ms: number): string {
  if (ms < 10) return 'bg-green-500'
  if (ms < 50) return 'bg-yellow-500'
  if (ms < 200) return 'bg-orange-500'
  return 'bg-red-500'
}

export function latencyBarWidth(ms: number, max: number): string {
  const pct = Math.min(100, (ms / Math.max(max, 1)) * 100)
  return `${pct}%`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions)
}
