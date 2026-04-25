/**
 * Proxy 核心可测试模块
 * 从 index.js 提取的纯数据结构和工具函数，供单元测试使用。
 */

// ─── TraceBuffer: 环形缓冲区 ───────────────────────────

export class TraceBuffer {
  constructor(maxSize) {
    this.maxSize = maxSize
    this.traces = new Map()       // trace_id → trace
    this.order = []               // 插入顺序（用于 LRU 淘汰）
  }

  add(trace) {
    // 如果满了，淘汰最旧的
    if (this.traces.size >= this.maxSize) {
      const oldest = this.order.shift()
      this.traces.delete(oldest)
    }
    this.traces.set(trace.trace_id, trace)
    this.order.push(trace.trace_id)
  }

  get(traceId) {
    return this.traces.get(traceId) || null
  }

  getAll(limit = 100) {
    const recent = this.order.slice(-limit).reverse()
    return recent.map(id => this.traces.get(id)).filter(Boolean)
  }

  filter({ topic, node, minLatency, maxLatency, timeFrom, timeTo }, limit = 100) {
    let results = this.getAll(this.maxSize)
    if (topic) results = results.filter(t => t.topic === topic)
    if (node) results = results.filter(t => t.node === node)
    if (minLatency != null) results = results.filter(t => t.latency_ms >= minLatency)
    if (maxLatency != null) results = results.filter(t => t.latency_ms <= maxLatency)
    if (timeFrom) results = results.filter(t => t.publish_ts >= timeFrom)
    if (timeTo) results = results.filter(t => t.publish_ts <= timeTo)
    return results.slice(0, limit)
  }

  get size() { return this.traces.size }
}

// ─── LatencyStats: 按话题的延迟统计 ────────────────────

export class LatencyStats {
  constructor(windowSize) {
    this.windowSize = windowSize
    this.stats = new Map()  // topic → { latencies[], count, ... }
  }

  record(topic, latencyMs, msgSize, msgType) {
    if (!this.stats.has(topic)) {
      this.stats.set(topic, {
        topic,
        count: 0,
        latencies: [],
        msgTypes: new Set(),
        totalSize: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
      })
    }
    const s = this.stats.get(topic)
    s.count++
    s.latencies.push(latencyMs)
    if (s.latencies.length > this.windowSize) s.latencies.shift()
    s.msgTypes.add(msgType)
    s.totalSize += msgSize
    s.lastSeen = Date.now()
  }

  get(topic) {
    const s = this.stats.get(topic)
    if (!s) return null
    return this._compute(s)
  }

  getAll() {
    return Array.from(this.stats.values()).map(s => this._compute(s))
  }

  _compute(s) {
    const sorted = [...s.latencies].sort((a, b) => a - b)
    const n = sorted.length
    if (n === 0) return { topic: s.topic, count: 0 }
    const elapsed = (s.lastSeen - s.firstSeen) / 1000
    return {
      topic: s.topic,
      count: s.count,
      msgTypes: Array.from(s.msgTypes),
      avg: sorted.reduce((a, b) => a + b, 0) / n,
      min: sorted[0],
      max: sorted[n - 1],
      p50: sorted[Math.floor(n * 0.5)],
      p90: sorted[Math.floor(n * 0.9)],
      p95: sorted[Math.floor(n * 0.95)],
      p99: sorted[Math.floor(n * 0.99)],
      msgsPerSec: elapsed > 0 ? s.count / elapsed : 0,
      avgSize: s.totalSize / s.count,
      lastSeen: s.lastSeen,
      _recentLatencies: [...s.latencies],
    }
  }
}

// ─── 瓶颈检测规则 ──────────────────────────────────────

export const BOTTLENECK_RULES = [
  { name: '高频延迟', check: s => s.p95 > 100 && s.count > 50, severity: 'critical' },
  { name: '延迟尖峰', check: s => s.max > s.p99 * 3 && s.max > 200, severity: 'warning' },
  { name: '消息堆积', check: s => s.msgsPerSec > 100 && s.p50 > 50, severity: 'critical' },
  { name: '大消息', check: s => s.avgSize > 1024 * 1024, severity: 'warning' },
]

export function detectBottlenecks(stats, rules = BOTTLENECK_RULES) {
  const bottlenecks = []

  for (const stat of stats) {
    for (const rule of rules) {
      if (rule.check(stat)) {
        bottlenecks.push({
          topic: stat.topic,
          rule: rule.name,
          severity: rule.severity,
          details: {
            p50: stat.p50,
            p95: stat.p95,
            p99: stat.p99,
            max: stat.max,
            avg: stat.avg,
            msgsPerSec: stat.msgsPerSec,
            avgSize: stat.avgSize,
            count: stat.count,
          },
          suggestion: getSuggestion(rule.name, stat),
        })
      }
    }
  }

  // 按严重程度排序
  const severityOrder = { critical: 0, warning: 1, info: 2 }
  bottlenecks.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  return bottlenecks
}

export function getSuggestion(ruleName, stat) {
  switch (ruleName) {
    case '高频延迟':
      return `${stat.topic} 延迟较高（p95=${stat.p95}ms），考虑增加 throttle_rate 或降低发布频率`
    case '延迟尖峰':
      return `${stat.topic} 出现延迟尖峰（max=${stat.max}ms），检查网络或计算瓶颈`
    case '消息堆积':
      return `${stat.topic} 消息频率高（${stat.msgsPerSec.toFixed(1)}/s）且延迟大，考虑消息压缩或分流`
    case '大消息':
      return `${stat.topic} 平均消息 ${(stat.avgSize / 1024).toFixed(1)}KB，考虑使用 compressed 话题或减少数据量`
    default:
      return '建议检查相关节点配置'
  }
}

// ─── 工具函数 ──────────────────────────────────────────

export function parseJson(data) {
  try {
    return JSON.parse(typeof data === 'string' ? data : data.toString())
  } catch {
    return null
  }
}
