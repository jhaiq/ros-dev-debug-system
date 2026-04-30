/**
 * ROS Bridge WebSocket Proxy
 * 
 * 拦截 rosbridge WebSocket 消息，注入 trace metadata，
 * 记录通信延迟，提供追踪数据查询 API。
 * 
 * 端口: 9091
 * 上游: ws://localhost:9090 (rosbridge_server)
 */

import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';

// ============ 配置 ============
const CONFIG = {
  PROXY_PORT: 9091,
  ROSBRIDGE_URL: 'ws://localhost:9090',
  MAX_TRACES: 5000,           // 环形缓冲区大小
  STATS_WINDOW: 1000,         // 每个话题保留最近 N 条延迟记录
  RECONNECT_DELAY: 3000,      // rosbridge 重连间隔 (ms)
};

// ============ 数据存储 ============

// 环形缓冲区：最近 N 条 trace
const traceBuffer = [];
let traceBufferIndex = 0;

// 按话题统计延迟
const topicStats = {};

// 瓶颈检测结果
const bottlenecks = [];

// ============ 工具函数 ============

function addTrace(trace) {
  if (traceBuffer.length < CONFIG.MAX_TRACES) {
    traceBuffer.push(trace);
  } else {
    traceBuffer[traceBufferIndex % CONFIG.MAX_TRACES] = trace;
    traceBufferIndex++;
  }
  
  // 更新话题统计
  updateTopicStats(trace);
  
  // 检测瓶颈
  detectBottlenecks(trace);
}

function updateTopicStats(trace) {
  const topic = trace.topic;
  if (!topicStats[topic]) {
    topicStats[topic] = {
      topic,
      count: 0,
      latencies: [],
      msgTypes: new Set(),
      nodes: new Set(),
      lastMsgTime: 0,
      msgsPerSec: 0,
    };
  }
  
  const stat = topicStats[topic];
  stat.count++;
  stat.latencies.push(trace.latency_ms);
  if (stat.latencies.length > CONFIG.STATS_WINDOW) {
    stat.latencies.shift();
  }
  if (trace.msg_type) stat.msgTypes.add(trace.msg_type);
  if (trace.node) stat.nodes.add(trace.node);
  
  // 计算消息频率
  const now = Date.now();
  if (stat.lastMsgTime > 0) {
    const interval = (now - stat.lastMsgTime) / 1000;
    stat.msgsPerSec = stat.msgsPerSec * 0.9 + (1 / interval) * 0.1; // 指数平滑
  }
  stat.lastMsgTime = now;
}

function detectBottlenecks(trace) {
  // 单条消息延迟检测
  if (trace.latency_ms > 500) {
    addBottleneck({
      type: 'high_latency',
      severity: 'critical',
      topic: trace.topic,
      node: trace.node,
      value: trace.latency_ms,
      threshold: 500,
      message: `消息延迟 ${trace.latency_ms}ms 超过阈值 500ms`,
      timestamp: trace.publish_ts,
    });
  } else if (trace.latency_ms > 200) {
    addBottleneck({
      type: 'high_latency',
      severity: 'warning',
      topic: trace.topic,
      node: trace.node,
      value: trace.latency_ms,
      threshold: 200,
      message: `消息延迟 ${trace.latency_ms}ms 超过阈值 200ms`,
      timestamp: trace.publish_ts,
    });
  }
  
  // 大消息检测
  if (trace.msg_size_bytes > 1024 * 1024) {
    addBottleneck({
      type: 'large_message',
      severity: 'warning',
      topic: trace.topic,
      node: trace.node,
      value: trace.msg_size_bytes,
      threshold: 1024 * 1024,
      message: `消息大小 ${(trace.msg_size_bytes / 1024).toFixed(1)}KB 超过 1MB`,
      timestamp: trace.publish_ts,
    });
  }
}

let lastBottleneckCheck = 0;
function addBottleneck(bottleneck) {
  // 去重：同一话题同类型最近 30s 内不重复
  const key = `${bottleneck.type}:${bottleneck.topic}`;
  const now = Date.now();
  const existing = bottlenecks.find(b => b.key === key && now - b.timestamp < 30000);
  if (!existing) {
    bottlenecks.push({ ...bottleneck, key });
    // 保留最近 100 条
    if (bottlenecks.length > 100) {
      bottlenecks.splice(0, bottlenecks.length - 100);
    }
  }
}

function calcPercentiles(latencies) {
  if (latencies.length === 0) return { p50: 0, p90: 0, p95: 0, p99: 0, max: 0, min: 0, avg: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const len = sorted.length;
  return {
    p50: sorted[Math.floor(len * 0.5)] || 0,
    p90: sorted[Math.floor(len * 0.9)] || 0,
    p95: sorted[Math.floor(len * 0.95)] || 0,
    p99: sorted[Math.floor(len * 0.99)] || 0,
    max: sorted[len - 1] || 0,
    min: sorted[0] || 0,
    avg: sorted.reduce((a, b) => a + b, 0) / len,
  };
}

// ============ 上游连接（到 rosbridge） ============

let upstreamWs = null;
let upstreamConnected = false;
const upstreamPendingMessages = [];

// 下游客户端列表
const downstreamClients = new Set();

function connectUpstream() {
  console.log(`[Proxy] 连接 rosbridge: ${CONFIG.ROSBRIDGE_URL}`);
  
  upstreamWs = new WebSocket(CONFIG.ROSBRIDGE_URL);
  
  upstreamWs.on('open', () => {
    console.log('[Proxy] ✅ 已连接 rosbridge');
    upstreamConnected = true;
    
    // 发送积压消息
    while (upstreamPendingMessages.length > 0) {
      const msg = upstreamPendingMessages.shift();
      upstreamWs.send(msg);
    }
  });
  
  upstreamWs.on('message', (data) => {
    // 记录从 rosbridge 收到消息的时间
    const receiveTime = Date.now();
    
    try {
      const message = JSON.parse(data.toString());
      
      // 如果是 publish 消息，记录延迟
      if (message.op === 'publish' && message.topic) {
        const traceId = message._trace_id || uuidv4();
        const publishTs = message._publish_ts || receiveTime;
        const latency = receiveTime - publishTs;
        
        const trace = {
          trace_id: traceId,
          topic: message.topic,
          node: message._node || 'unknown',
          publish_ts: publishTs,
          subscribe_ts: receiveTime,
          latency_ms: latency,
          hop_count: message._hop_count || 1,
          msg_size_bytes: Buffer.byteLength(data.toString()),
          msg_type: message._msg_type || 'unknown',
          // 消息体（截断，保留关键字段）
          payload: message.msg ? JSON.stringify(message.msg).substring(0, 500) : '',
        };
        
        addTrace(trace);
        
        // 移除注入字段后再转发给下游
        const cleanMessage = { ...message };
        delete cleanMessage._trace_id;
        delete cleanMessage._publish_ts;
        delete cleanMessage._hop_count;
        delete cleanMessage._node;
        delete cleanMessage._msg_type;
        
        // 转发给所有下游客户端
        const forwardData = JSON.stringify(cleanMessage);
        for (const client of downstreamClients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(forwardData);
          }
        }
      } else {
        // 其他消息直接转发
        for (const client of downstreamClients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(data.toString());
          }
        }
      }
    } catch (e) {
      // 非 JSON 数据直接转发
      for (const client of downstreamClients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data.toString());
        }
      }
    }
  });
  
  upstreamWs.on('close', (code, reason) => {
    console.log(`[Proxy] ⚠️ rosbridge 连接断开: code=${code}`);
    upstreamConnected = false;
    
    // 3 秒后重连
    setTimeout(connectUpstream, CONFIG.RECONNECT_DELAY);
  });
  
  upstreamWs.on('error', (err) => {
    console.error(`[Proxy] ❌ rosbridge 连接错误: ${err.message}`);
  });
}

// ============ 下游服务器（供前端连接） ============

const downstreamWss = new WebSocketServer({ noServer: true });

downstreamWss.on('connection', (ws, req) => {
  console.log(`[Proxy] 📱 前端客户端连接: ${req.socket.remoteAddress}`);
  downstreamClients.add(ws);
  
  // 发送当前状态
  ws.send(JSON.stringify({
    op: 'proxy_status',
    status: upstreamConnected ? 'connected' : 'connecting',
    trace_count: traceBuffer.length,
    timestamp: Date.now(),
  }));
  
  ws.on('close', () => {
    downstreamClients.delete(ws);
    console.log('[Proxy] 📱 前端客户端断开');
  });
  
  ws.on('message', (data) => {
    // 转发到上游 rosbridge
    const message = data.toString();
    if (upstreamConnected && upstreamWs.readyState === WebSocket.OPEN) {
      upstreamWs.send(message);
    } else {
      upstreamPendingMessages.push(message);
      if (upstreamPendingMessages.length > 1000) {
        upstreamPendingMessages.shift(); // 丢弃最老的
      }
    }
  });
});

// ============ REST API ============

const app = express();

// GET /api/traces — 获取追踪列表
app.get('/api/traces', (req, res) => {
  const { limit = 100, topic, min_latency, max_latency } = req.query;
  
  let traces = [...traceBuffer];
  
  // 过滤
  if (topic) traces = traces.filter(t => t.topic === topic);
  if (min_latency) traces = traces.filter(t => t.latency_ms >= Number(min_latency));
  if (max_latency) traces = traces.filter(t => t.latency_ms <= Number(max_latency));
  
  // 按时间倒序
  traces.sort((a, b) => b.publish_ts - a.publish_ts);
  
  res.json({
    total: traces.length,
    traces: traces.slice(0, Number(limit)),
  });
});

// GET /api/traces/:id — 获取单条 trace
app.get('/api/traces/:id', (req, res) => {
  const trace = traceBuffer.find(t => t.trace_id === req.params.id);
  if (!trace) {
    return res.status(404).json({ error: 'Trace not found' });
  }
  res.json(trace);
});

// GET /api/latency — 获取延迟统计
app.get('/api/latency', (req, res) => {
  const stats = {};
  for (const [topic, stat] of Object.entries(topicStats)) {
    const percentiles = calcPercentiles(stat.latencies);
    stats[topic] = {
      topic,
      count: stat.count,
      msgTypes: [...stat.msgTypes],
      nodes: [...stat.nodes],
      msgsPerSec: parseFloat(stat.msgsPerSec.toFixed(2)),
      ...percentiles,
    };
  }
  res.json({ stats, timestamp: Date.now() });
});

// GET /api/bottlenecks — 获取瓶颈检测
app.get('/api/bottlenecks', (req, res) => {
  // 重新计算聚合瓶颈
  const aggregateBottlenecks = [];
  
  for (const [topic, stat] of Object.entries(topicStats)) {
    const percentiles = calcPercentiles(stat.latencies);
    
    if (percentiles.p95 > 100 && stat.count > 10) {
      aggregateBottlenecks.push({
        type: 'high_p95_latency',
        severity: percentiles.p95 > 200 ? 'critical' : 'warning',
        topic,
        value: percentiles.p95,
        message: `话题 ${topic} p95 延迟 ${percentiles.p95.toFixed(1)}ms`,
        suggestion: '考虑增加 throttle_rate 或检查网络延迟',
      });
    }
    
    if (stat.msgsPerSec > 100 && percentiles.avg > 50) {
      aggregateBottlenecks.push({
        type: 'high_throughput_latency',
        severity: 'warning',
        topic,
        value: stat.msgsPerSec,
        message: `话题 ${topic} 高频 ${stat.msgsPerSec.toFixed(1)} msg/s 且平均延迟 ${percentiles.avg.toFixed(1)}ms`,
        suggestion: '建议减少发布频率或使用队列限流',
      });
    }
  }
  
  // 合并单条检测和聚合检测
  const allBottlenecks = [
    ...bottlenecks.filter(b => Date.now() - b.timestamp < 300000), // 最近 5 分钟
    ...aggregateBottlenecks,
  ];
  
  // 按严重程度排序
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  allBottlenecks.sort((a, b) => (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3));
  
  res.json({ bottlenecks: allBottlenecks, count: allBottlenecks.length });
});

// GET /api/stats — 实时统计摘要
app.get('/api/stats', (req, res) => {
  res.json({
    trace_count: traceBuffer.length,
    topic_count: Object.keys(topicStats).length,
    topics: Object.keys(topicStats),
    upstream_connected: upstreamConnected,
    downstream_clients: downstreamClients.size,
    bottlenecks_count: bottlenecks.length,
    timestamp: Date.now(),
  });
});

// GET /api/topics — 话题列表
app.get('/api/topics', (req, res) => {
  const topics = Object.entries(topicStats).map(([topic, stat]) => ({
    topic,
    count: stat.count,
    msgsPerSec: parseFloat(stat.msgsPerSec.toFixed(2)),
    ...calcPercentiles(stat.latencies),
  }));
  
  res.json({ topics });
});

// ============ 启动 ============

const server = app.listen(CONFIG.PROXY_PORT, () => {
  console.log(`[Proxy] 🚀 REST API 运行在 http://localhost:${CONFIG.PROXY_PORT}`);
});

// 升级 HTTP 连接到 WebSocket
server.on('upgrade', (req, socket, head) => {
  downstreamWss.handleUpgrade(req, socket, head, (ws) => {
    downstreamWss.emit('connection', ws, req);
  });
});

// 启动上游连接
connectUpstream();

console.log(`[Proxy] 📡 ROS Bridge Proxy 已启动`);
console.log(`[Proxy] 上游: ${CONFIG.ROSBRIDGE_URL}`);
console.log(`[Proxy] 下游: ws://localhost:${CONFIG.PROXY_PORT}`);
console.log(`[Proxy] REST API: http://localhost:${CONFIG.PROXY_PORT}/api/*`);
