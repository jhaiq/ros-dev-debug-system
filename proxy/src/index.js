/**
 * ROS Bridge Trace Proxy
 * 
 * 中间层 WebSocket Proxy，拦截 rosbridge 消息，注入 trace metadata，
 * 记录延迟统计，提供 REST API + WebSocket 推送追踪数据。
 * 
 * 架构:
 *   Frontend (ws://localhost:9091) ←→ Proxy (9091) ←→ rosbridge (9090)
 * 
 * 功能:
 *   - 双 WebSocket 连接管理（上游 rosbridge + 下游前端）
 *   - 消息拦截与 trace metadata 注入
 *   - 延迟计算（publish → subscribe）
 *   - 环形缓冲区存储 + REST API + 实时 WS 推送
 */

import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import express from 'express'
import cors from 'cors'
import { v4 as uuidv4 } from 'uuid'

// ─── 配置 ──────────────────────────────────────────────
const CONFIG = {
  PROXY_PORT: parseInt(process.env.PROXY_PORT) || 9091,
  ROSBRIDGE_URL: process.env.ROSBridge_URL || 'ws://localhost:9090',
  API_PORT: parseInt(process.env.API_PORT) || 9092,
  TRACE_BUFFER_SIZE: parseInt(process.env.TRACE_BUFFER_SIZE) || 10000,
  LATENCY_WINDOW: parseInt(process.env.LATENCY_WINDOW) || 1000,
  RECONNECT_INTERVAL: 3000,
}

// ─── 数据存储 ──────────────────────────────────────────

/** 环形缓冲区：按 trace_id 索引的 trace 记录 */
class TraceBuffer {
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

/** 按话题的延迟统计（滑动窗口） */
class LatencyStats {
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
    }
  }
}

// ─── 初始化 ────────────────────────────────────────────
const traceBuffer = new TraceBuffer(CONFIG.TRACE_BUFFER_SIZE)
const latencyStats = new LatencyStats(CONFIG.LATENCY_WINDOW)

// 用于收集待配对的 publish 消息（按 topic 分组）
const pendingPublish = new Map()  // topic → [{ trace_id, payload, ts }]

// ─── 上游 WebSocket（连接 rosbridge） ──────────────────
let upstreamWs = null
let upstreamConnected = false

function connectUpstream() {
  console.log(`🔌 连接 rosbridge: ${CONFIG.ROSBridge_URL}`)
  
  try {
    upstreamWs = new WebSocket(CONFIG.ROSBridge_URL)
  } catch (err) {
    console.error(`❌ 上游连接失败: ${err.message}`)
    setTimeout(connectUpstream, CONFIG.RECONNECT_INTERVAL)
    return
  }

  upstreamWs.on('open', () => {
    console.log('✅ rosbridge 连接成功')
    upstreamConnected = true
  })

  upstreamWs.on('message', (data) => {
    const msg = parseJson(data)
    if (!msg) return

    // 拦截 publish 消息：记录用于后续延迟计算
    if (msg.op === 'publish') {
      const traceId = uuidv4()
      const publishTs = Date.now()
      pendingPublish.set(traceId, {
        trace_id: traceId,
        topic: msg.topic,
        node: msg.node || 'unknown',
        msg_type: msg.msg_type || '',
        publish_ts: publishTs,
        payload: msg.msg,
        msg_size: Buffer.byteLength(JSON.stringify(msg.msg)),
      })
    }

    // 拦截 incoming 消息（来自 rosbridge 的 msg 类型）：匹配延迟
    if (msg.op === 'msg' || msg.topic) {
      // 尝试匹配最近的 publish
      const topic = msg.topic
      const pending = findPendingForTopic(topic)
      if (pending) {
        const subscribeTs = Date.now()
        const latency = subscribeTs - pending.publish_ts

        const trace = {
          trace_id: pending.trace_id,
          topic: pending.topic,
          node: pending.node,
          msg_type: pending.msg_type,
          publish_ts: pending.publish_ts,
          subscribe_ts: subscribeTs,
          latency_ms: Math.max(0, latency),
          hop_count: 1,
          msg_size_bytes: pending.msg_size,
        }

        traceBuffer.add(trace)
        latencyStats.record(trace.topic, trace.latency_ms, trace.msg_size_bytes, trace.msg_type)

        // 推送给前端 trace 订阅者
        pushToTraceSubscribers(trace)
      }
    }

    // 转发给所有下游客户端
    broadcastDownstream(data)
  })

  upstreamWs.on('close', () => {
    console.log('⚠️ rosbridge 连接断开')
    upstreamConnected = false
    setTimeout(connectUpstream, CONFIG.RECONNECT_INTERVAL)
  })

  upstreamWs.on('error', (err) => {
    console.error(`❌ rosbridge 错误: ${err.message}`)
  })
}

function findPendingForTopic(topic) {
  // 简单策略：取该 topic 最早的 pending
  // 实际可优化为按 topic 分组的队列
  for (const [id, pending] of pendingPublish) {
    if (pending.topic === topic) {
      pendingPublish.delete(id)
      return pending
    }
  }
  return null
}

// ─── 下游 WebSocket Server（前端连接） ─────────────────
const downstreamClients = new Set()
const traceSubscribers = new Set()  // 订阅实时 trace 推送的客户端

const downstreamWss = new WebSocketServer({ noServer: true })

downstreamWss.on('connection', (ws) => {
  downstreamClients.add(ws)
  console.log(`📱 前端连接 (${downstreamClients.size} 在线)`)

  ws.on('message', (data) => {
    const msg = parseJson(data)
    if (!msg) return

    // 前端订阅 trace 推送
    if (msg.action === 'subscribe_traces') {
      traceSubscribers.add(ws)
      return
    }
    if (msg.action === 'unsubscribe_traces') {
      traceSubscribers.delete(ws)
      return
    }

    // 其他消息转发到上游
    if (upstreamConnected && upstreamWs.readyState === WebSocket.OPEN) {
      upstreamWs.send(data)
    }
  })

  ws.on('close', () => {
    downstreamClients.delete(ws)
    traceSubscribers.delete(ws)
    console.log(`📱 前端断开 (${downstreamClients.size} 在线)`)
  })
})

function broadcastDownstream(data) {
  const msg = typeof data === 'string' ? data : data.toString()
  for (const ws of downstreamClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg)
    }
  }
}

function pushToTraceSubscribers(trace) {
  const payload = JSON.stringify({ type: 'trace', trace })
  for (const ws of traceSubscribers) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload)
    }
  }
}

// ─── HTTP API Server ───────────────────────────────────
const app = express()
app.use(cors())
app.use(express.json())

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    upstream: upstreamConnected,
    downstreamClients: downstreamClients.size,
    traceBufferSize: traceBuffer.size,
  })
})

// 获取 trace 列表
app.get('/api/traces', (req, res) => {
  const { topic, node, minLatency, maxLatency, timeFrom, timeTo, limit } = req.query
  const traces = traceBuffer.filter({
    topic,
    node,
    minLatency: minLatency ? parseFloat(minLatency) : null,
    maxLatency: maxLatency ? parseFloat(maxLatency) : null,
    timeFrom: timeFrom ? parseInt(timeFrom) : null,
    timeTo: timeTo ? parseInt(timeTo) : null,
  }, parseInt(limit) || 100)
  res.json({ total: traces.length, traces })
})

// 获取单条 trace 详情
app.get('/api/traces/:id', (req, res) => {
  const trace = traceBuffer.get(req.params.id)
  if (!trace) return res.status(404).json({ error: 'Trace not found' })
  res.json(trace)
})

// 获取延迟统计
app.get('/api/latency', (req, res) => {
  const { topic } = req.query
  if (topic) {
    const stat = latencyStats.get(topic)
    if (!stat) return res.status(404).json({ error: 'No stats for topic' })
    res.json(stat)
  } else {
    res.json({ topics: latencyStats.getAll() })
  }
})

// 获取瓶颈检测
app.get('/api/bottlenecks', (req, res) => {
  const bottlenecks = detectBottlenecks()
  res.json({ bottlenecks, detectedAt: Date.now() })
})

// 实时统计摘要
app.get('/api/stats', (req, res) => {
  res.json({
    traceBufferSize: traceBuffer.size,
    downstreamClients: downstreamClients.size,
    upstreamConnected,
    topicsTracked: latencyStats.getAll().map(s => s.topic),
    latencySummary: latencyStats.getAll(),
  })
})

const apiServer = createServer(app)

// 升级 HTTP 请求到 WebSocket
apiServer.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws/traces') {
    downstreamWss.handleUpgrade(req, socket, head, (ws) => {
      downstreamWss.emit('connection', ws, req)
    })
  }
})

apiServer.listen(CONFIG.API_PORT, () => {
  console.log(`📡 Trace API 运行在 http://localhost:${CONFIG.API_PORT}`)
  console.log(`🔌 WebSocket: ws://localhost:${CONFIG.API_PORT}/ws/traces`)
})

// ─── 瓶颈检测 ──────────────────────────────────────────
const BOTTLENECK_RULES = [
  { name: '高频延迟', check: s => s.p95 > 100 && s.count > 50, severity: 'critical' },
  { name: '延迟尖峰', check: s => s.max > s.p99 * 3 && s.max > 200, severity: 'warning' },
  { name: '消息堆积', check: s => s.msgsPerSec > 100 && s.p50 > 50, severity: 'critical' },
  { name: '大消息', check: s => s.avgSize > 1024 * 1024, severity: 'warning' },
]

function detectBottlenecks() {
  const all = latencyStats.getAll()
  const bottlenecks = []

  for (const stat of all) {
    for (const rule of BOTTLENECK_RULES) {
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

function getSuggestion(ruleName, stat) {
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
function parseJson(data) {
  try {
    return JSON.parse(data.toString())
  } catch {
    return null
  }
}

// ─── 启动 ──────────────────────────────────────────────
console.log(`🚀 ROS Trace Proxy 启动中...`)
console.log(`   上游: ${CONFIG.ROSBridge_URL}`)
console.log(`   代理端口: ${CONFIG.PROXY_PORT}`)
console.log(`   API 端口: ${CONFIG.API_PORT}`)
console.log(`   Trace 缓冲区: ${CONFIG.TRACE_BUFFER_SIZE} 条`)

// 启动上游连接
connectUpstream()
