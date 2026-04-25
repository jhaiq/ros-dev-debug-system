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
import {
  detectLatencyAnomalies,
  detectFrequencyAnomalies,
  detectLatencyTrend,
  rootCauseAnalysis,
  generateRecommendations,
  generateHealthReport,
} from './diagnostics.js'
import {
  TraceBuffer,
  LatencyStats,
  BOTTLENECK_RULES,
  detectBottlenecks as _detectBottlenecks,
  getSuggestion as _getSuggestion,
  parseJson,
} from './utils.js'

// ─── 配置 ──────────────────────────────────────────────
const CONFIG = {
  PROXY_PORT: parseInt(process.env.PROXY_PORT) || 9091,
  ROSBRIDGE_URL: process.env.ROSBridge_URL || 'ws://localhost:9090',
  API_PORT: parseInt(process.env.API_PORT) || 9092,
  TRACE_BUFFER_SIZE: parseInt(process.env.TRACE_BUFFER_SIZE) || 10000,
  LATENCY_WINDOW: parseInt(process.env.LATENCY_WINDOW) || 1000,
  RECONNECT_INTERVAL: 3000,
}

// ─── 初始化 ────────────────────────────────────────────
const traceBuffer = new TraceBuffer(CONFIG.TRACE_BUFFER_SIZE)
const latencyStats = new LatencyStats(CONFIG.LATENCY_WINDOW)

// 按 topic 分组的 FIFO 队列：避免线性扫描 + 保证 publish/subscribe 正确配对
const pendingPublish = new Map()  // topic → [{ trace_id, payload, ts }]

// 定时清理超过 30 秒未匹配的 pending（防止内存泄漏）
const PENDING_TIMEOUT_MS = 30000
const cleanupInterval = setInterval(() => {
  const now = Date.now()
  let cleaned = 0
  for (const [topic, queue] of pendingPublish) {
    const before = queue.length
    // 移除超时的条目
    while (queue.length > 0 && now - queue[0].publish_ts > PENDING_TIMEOUT_MS) {
      queue.shift()
      cleaned++
    }
    // 清理空队列
    if (queue.length === 0) pendingPublish.delete(topic)
  }
  if (cleaned > 0) console.log(`🧹 清理 ${cleaned} 条超时的 pending publish`)
}, 10000)

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
    
    // 心跳检测：每 15 秒发送 ping，检测"半死"连接
    upstreamWs._heartbeat = setInterval(() => {
      if (upstreamWs.readyState === WebSocket.OPEN) {
        upstreamWs.ping()
      }
    }, 15000)
  })

  upstreamWs.on('message', (data) => {
    const msg = parseJson(data)
    if (!msg) return

    // 拦截 publish 消息：记录用于后续延迟计算（按 topic 分组队列）
    if (msg.op === 'publish') {
      const traceId = uuidv4()
      const publishTs = Date.now()
      const topic = msg.topic
      if (!pendingPublish.has(topic)) pendingPublish.set(topic, [])
      pendingPublish.get(topic).push({
        trace_id: traceId,
        topic: topic,
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
    if (upstreamWs._heartbeat) clearInterval(upstreamWs._heartbeat)
    setTimeout(connectUpstream, CONFIG.RECONNECT_INTERVAL)
  })

  upstreamWs.on('error', (err) => {
    console.error(`❌ rosbridge 错误: ${err.message}`)
    if (upstreamWs._heartbeat) clearInterval(upstreamWs._heartbeat)
  })
}

function findPendingForTopic(topic) {
  // O(1) 查找：按 topic 分组的 FIFO 队列
  const queue = pendingPublish.get(topic)
  if (!queue || queue.length === 0) return null
  return queue.shift()
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

// ─── AI 诊断 API ───────────────────────────────────────

// 异常检测
app.get('/api/anomalies', (req, res) => {
  const topicStats = latencyStats.getAll()
  const anomalies = [
    ...detectLatencyAnomalies(topicStats),
    ...detectFrequencyAnomalies(topicStats),
    ...detectLatencyTrend(topicStats),
  ]
  // Sort by severity
  const severityOrder = { critical: 0, warning: 1, info: 2 }
  anomalies.sort((a, b) => (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2))
  res.json({ anomalies, detectedAt: Date.now() })
})

// 根因分析
app.get('/api/rootcauses', (req, res) => {
  const bottlenecks = detectBottlenecks()
  const topicStats = latencyStats.getAll()
  const rootCauses = rootCauseAnalysis(bottlenecks, topicStats)
  res.json({ rootCauses, detectedAt: Date.now() })
})

// 配置优化建议
app.get('/api/recommendations', (req, res) => {
  const topicStats = latencyStats.getAll()
  const bottlenecks = detectBottlenecks()
  const anomalies = [
    ...detectLatencyAnomalies(topicStats),
    ...detectFrequencyAnomalies(topicStats),
    ...detectLatencyTrend(topicStats),
  ]
  const recommendations = generateRecommendations(topicStats, bottlenecks, anomalies)
  res.json({ recommendations, generatedAt: Date.now() })
})

// 健康诊断报告
app.get('/api/diagnostics', (req, res) => {
  const topicStats = latencyStats.getAll()
  const bottlenecks = detectBottlenecks()
  const anomalies = [
    ...detectLatencyAnomalies(topicStats),
    ...detectFrequencyAnomalies(topicStats),
    ...detectLatencyTrend(topicStats),
  ]
  const recommendations = generateRecommendations(topicStats, bottlenecks, anomalies)
  const rootCauses = rootCauseAnalysis(bottlenecks, topicStats)
  const report = generateHealthReport(topicStats, bottlenecks, anomalies, recommendations, rootCauses)
  res.json(report)
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

// ─── 启动 ──────────────────────────────────────────────

// Wrapper for API usage (uses live latencyStats instance)
function detectBottlenecks() {
  return _detectBottlenecks(latencyStats.getAll())
}

function getSuggestion(ruleName, stat) {
  return _getSuggestion(ruleName, stat)
}
console.log(`🚀 ROS Trace Proxy 启动中...`)
console.log(`   上游: ${CONFIG.ROSBridge_URL}`)
console.log(`   代理端口: ${CONFIG.PROXY_PORT}`)
console.log(`   API 端口: ${CONFIG.API_PORT}`)
console.log(`   Trace 缓冲区: ${CONFIG.TRACE_BUFFER_SIZE} 条`)

// 启动上游连接
connectUpstream()
