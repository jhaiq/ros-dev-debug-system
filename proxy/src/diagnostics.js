/**
 * AI 诊断引擎 — 自动故障诊断 + 配置优化建议 + 异常检测
 * 
 * 功能:
 *   - 异常检测 (延迟突增 / 消息频率异常 / 节点断连)
 *   - 自动根因分析 (追溯延迟源头 / 级联延迟识别)
 *   - 配置优化建议 (话题限流 / 节点拆分 / QoS 配置)
 *   - 系统健康报告生成
 */

// ─── 异常检测 ──────────────────────────────────────────

/**
 * 延迟异常检测
 * 检测话题延迟是否超过历史基线的 2σ
 */
function detectLatencyAnomalies(topicStats, historyWindow = []) {
  const anomalies = []

  for (const stats of topicStats) {
    if (stats.count < 10) continue  // 数据不足

    const latencies = stats._recentLatencies || []
    if (latencies.length < 10) continue

    // 计算历史均值和标准差
    const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length
    const variance = latencies.reduce((sum, v) => sum + (v - mean) ** 2, 0) / latencies.length
    const stdDev = Math.sqrt(variance)

    // 当前 p95 是否异常
    const threshold = mean + 2 * stdDev
    if (stats.p95 > threshold && stats.p95 > 50) {
      anomalies.push({
        type: 'latency_spike',
        topic: stats.topic,
        severity: stats.p95 > mean + 3 * stdDev ? 'critical' : 'warning',
        current_p95: stats.p95,
        baseline_mean: Math.round(mean),
        baseline_stddev: Math.round(stdDev),
        threshold: Math.round(threshold),
        message: `${stats.topic} 延迟异常上升: p95=${stats.p95}ms (基线: ${Math.round(mean)}±${Math.round(stdDev)}ms, 阈值: ${Math.round(threshold)}ms)`,
        timestamp: Date.now(),
      })
    }
  }

  return anomalies
}

/**
 * 消息频率异常检测
 * 检测话题消息频率是否突增或突降
 */
function detectFrequencyAnomalies(topicStats, expectedFreq = {}) {
  const anomalies = []

  for (const stats of topicStats) {
    if (stats.count < 10) continue

    const expected = expectedFreq[stats.topic]
    if (!expected) continue

    const deviation = (stats.msgsPerSec - expected) / expected
    const absDev = Math.abs(deviation)

    if (absDev > 0.5) {  // 超过 50% 偏差
      anomalies.push({
        type: 'frequency_anomaly',
        topic: stats.topic,
        severity: absDev > 1.0 ? 'critical' : 'warning',
        expected_msgs_per_sec: expected,
        actual_msgs_per_sec: Math.round(stats.msgsPerSec * 10) / 10,
        deviation_pct: Math.round(deviation * 100),
        message: `${stats.topic} 消息频率异常: 期望 ${expected}/s, 实际 ${Math.round(stats.msgsPerSec * 10) / 10}/s (偏差 ${Math.round(deviation * 100)}%)`,
        direction: deviation > 0 ? '突增' : '突降',
        timestamp: Date.now(),
      })
    }
  }

  return anomalies
}

/**
 * 延迟趋势检测 (连续上升趋势)
 */
function detectLatencyTrend(topicStats) {
  const anomalies = []

  for (const stats of topicStats) {
    const latencies = stats._recentLatencies || []
    if (latencies.length < 20) continue

    // 取最近 20 条，看是否连续上升
    const recent = latencies.slice(-20)
    let increasingCount = 0
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] > recent[i - 1]) increasingCount++
    }

    // 如果超过 75% 的时间在上升
    if (increasingCount > recent.length * 0.75) {
      anomalies.push({
        type: 'latency_trend',
        topic: stats.topic,
        severity: 'warning',
        trend_start: recent[0],
        trend_end: recent[recent.length - 1],
        trend_pct: Math.round(((recent[recent.length - 1] - recent[0]) / Math.max(recent[0], 1)) * 100),
        message: `${stats.topic} 延迟持续上升: ${recent[0]}ms → ${recent[recent.length - 1]}ms (最近 20 条中 ${increasingCount} 条递增)`,
        timestamp: Date.now(),
      })
    }
  }

  return anomalies
}

// ─── 根因分析 ──────────────────────────────────────────

/**
 * 自动根因分析
 * 根据拓扑和延迟数据追溯延迟源头
 */
function rootCauseAnalysis(bottlenecks, topicStats) {
  const rootCauses = []

  // 规则 1: 高频话题导致下游延迟
  const highFreqTopics = topicStats.filter(s => s.msgsPerSec > 50)
  for (const hf of highFreqTopics) {
    const downstreamBottlenecks = bottlenecks.filter(
      b => b.topic !== hf.topic && b.details.msgsPerSec < hf.msgsPerSec
    )
    if (downstreamBottlenecks.length > 0) {
      rootCauses.push({
        type: 'upstream_cascade',
        severity: 'warning',
        rootTopic: hf.topic,
        rootMsgsPerSec: hf.msgsPerSec,
        affectedTopics: downstreamBottlenecks.map(b => b.topic),
        message: `${hf.topic} 高频发布 (${hf.msgsPerSec.toFixed(1)}/s) 可能导致下游话题延迟`,
        suggestion: `考虑增加 ${hf.topic} 的 throttle_rate 参数`,
        confidence: downstreamBottlenecks.length > 2 ? 'high' : 'medium',
      })
    }
  }

  // 规则 2: 大消息导致网络拥塞
  const largeMsgTopics = topicStats.filter(s => s.avgSize > 500 * 1024)
  for (const lm of largeMsgTopics) {
    rootCauses.push({
      type: 'large_message',
      severity: 'warning',
      topic: lm.topic,
      avgSizeKB: Math.round(lm.avgSize / 1024),
      message: `${lm.topic} 平均消息 ${Math.round(lm.avgSize / 1024)}KB，可能造成网络拥塞`,
      suggestion: `使用 ${lm.topic}/compressed 话题或减少数据量`,
      confidence: lm.avgSize > 1024 * 1024 ? 'high' : 'medium',
    })
  }

  // 规则 3: 多瓶颈同一节点
  const nodeBottleneckCount = {}
  for (const b of bottlenecks) {
    const node = b.details._node || 'unknown'
    nodeBottleneckCount[node] = (nodeBottleneckCount[node] || 0) + 1
  }
  for (const [node, count] of Object.entries(nodeBottleneckCount)) {
    if (count >= 3) {
      rootCauses.push({
        type: 'node_overloaded',
        severity: 'critical',
        node,
        bottleneckCount: count,
        message: `节点 ${node} 关联 ${count} 个瓶颈，可能过载`,
        suggestion: `考虑拆分 ${node} 的职责或增加硬件资源`,
        confidence: count >= 5 ? 'high' : 'medium',
      })
    }
  }

  return rootCauses
}

// ─── 配置优化建议 ──────────────────────────────────────

/**
 * 基于检测结果生成 ROS 配置优化建议
 */
function generateRecommendations(topicStats, bottlenecks, anomalies) {
  const recommendations = []

  for (const stats of topicStats) {
    // 规则 1: 高频话题建议限流
    if (stats.msgsPerSec > 30 && stats.p50 > 20) {
      const suggestedThrottle = Math.max(10, Math.round(stats.p50 * 2))
      recommendations.push({
        id: `rec_throttle_${stats.topic.replace(/[\/\s]/g, '_')}`,
        type: 'throttle',
        priority: stats.p95 > 100 ? 'high' : 'medium',
        topic: stats.topic,
        title: `为 ${stats.topic} 添加 throttle_rate`,
        description: `该话题发布频率 ${stats.msgsPerSec.toFixed(1)}/s，平均延迟 ${stats.avg.toFixed(0)}ms。建议添加 throttle_rate 参数降低频率。`,
        action: `在 publisher 中添加: <param name="throttle_rate" value="${suggestedThrottle}" />`,
        expectedImpact: `延迟降低 ${(stats.p50 / 2).toFixed(0)}ms，消息量减少 ${Math.round(stats.msgsPerSec * 0.3)}/s`,
        confidence: 'high',
      })
    }

    // 规则 2: 大消息建议压缩
    if (stats.avgSize > 100 * 1024) {
      recommendations.push({
        id: `rec_compress_${stats.topic.replace(/[\/\s]/g, '_')}`,
        type: 'compression',
        priority: stats.avgSize > 500 * 1024 ? 'high' : 'low',
        topic: stats.topic,
        title: `压缩 ${stats.topic} 消息`,
        description: `该话题平均消息大小 ${(stats.avgSize / 1024).toFixed(0)}KB。建议使用 compressed 话题类型。`,
        action: `使用 image_transport/compressed 或自定义压缩消息类型`,
        expectedImpact: `消息大小减少 60-90%，网络带宽降低`,
        confidence: 'high',
      })
    }

    // 规则 3: 高延迟建议优化 QoS
    if (stats.p95 > 200 && stats.count > 100) {
      recommendations.push({
        id: `rec_qos_${stats.topic.replace(/[\/\s]/g, '_')}`,
        type: 'qos',
        priority: 'high',
        topic: stats.topic,
        title: `优化 ${stats.topic} 的 QoS 配置`,
        description: `该话题 p95 延迟 ${stats.p95}ms，消息数 ${stats.count}。建议调整 QoS 策略。`,
        action: `设置 QoS: history=KEEP_LAST, depth=10, reliability=BEST_EFFORT, durability=VOLATILE`,
        expectedImpact: `延迟降低 20-50%，适用于传感器数据话题`,
        confidence: 'medium',
      })
    }

    // 规则 4: 延迟尖峰建议增加缓冲区
    if (stats.max > stats.p99 * 3 && stats.max > 500) {
      recommendations.push({
        id: `rec_buffer_${stats.topic.replace(/[\/\s]/g, '_')}`,
        type: 'buffer',
        priority: 'medium',
        topic: stats.topic,
        title: `为 ${stats.topic} 增加消息缓冲`,
        description: `该话题最大延迟 ${stats.max}ms 远超 p99 (${stats.p99}ms)，存在延迟尖峰。`,
        action: `增加 subscriber 队列大小 (queue_size) 或使用 message_filters`,
        expectedImpact: `减少延迟尖峰频率`,
        confidence: 'medium',
      })
    }
  }

  // 按优先级排序
  const priorityOrder = { high: 0, medium: 1, low: 2 }
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  return recommendations
}

// ─── 健康报告生成 ──────────────────────────────────────

/**
 * 生成系统健康诊断报告
 */
function generateHealthReport(topicStats, bottlenecks, anomalies, recommendations, rootCauses) {
  const totalTopics = topicStats.length
  const totalMessages = topicStats.reduce((s, t) => s + t.count, 0)
  const totalThroughput = topicStats.reduce((s, t) => s + t.msgsPerSec, 0)
  const avgLatency = topicStats.length > 0
    ? topicStats.reduce((s, t) => s + t.avg, 0) / topicStats.length
    : 0
  const maxP95 = topicStats.length > 0
    ? Math.max(...topicStats.map(t => t.p95))
    : 0

  // 健康评分
  let healthScore = 100
  if (bottlenecks.filter(b => b.severity === 'critical').length > 0) healthScore -= 30
  if (bottlenecks.filter(b => b.severity === 'warning').length > 0) healthScore -= 15
  if (anomalies.filter(a => a.severity === 'critical').length > 0) healthScore -= 20
  if (anomalies.filter(a => a.severity === 'warning').length > 0) healthScore -= 10
  if (maxP95 > 200) healthScore -= 15
  else if (maxP95 > 100) healthScore -= 5
  healthScore = Math.max(0, healthScore)

  // 生成 Markdown 报告
  const report = [
    `# ROS 系统健康诊断报告`,
    ``,
    `**生成时间**: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
    `**健康评分**: ${healthScore}/100 ${healthScore >= 80 ? '🟢 良好' : healthScore >= 50 ? '🟡 一般' : '🔴 需关注'}`,
    ``,
    `## 📊 系统概览`,
    ``,
    `| 指标 | 数值 |`,
    `|------|------|`,
    `| 监控话题数 | ${totalTopics} |`,
    `| 总消息数 | ${totalMessages} |`,
    `| 总吞吐率 | ${totalThroughput.toFixed(1)} msg/s |`,
    `| 平均延迟 | ${avgLatency.toFixed(1)} ms |`,
    `| 最高 p95 延迟 | ${maxP95} ms |`,
    ``,
    `## 🛡️ 瓶颈检测`,
    ``,
    bottlenecks.length === 0
      ? `暂无检测到瓶颈 ✅`
      : bottlenecks.map(b => `- **${b.severity.toUpperCase()}** ${b.topic}: ${b.rule} (p95: ${b.details.p95}ms)`).join('\n'),
    ``,
    `## ⚠️ 异常检测`,
    ``,
    anomalies.length === 0
      ? `暂无异常 ✅`
      : anomalies.map(a => `- **${a.severity.toUpperCase()}** [${a.type}] ${a.message}`).join('\n'),
    ``,
    `## 🔍 根因分析`,
    ``,
    rootCauses.length === 0
      ? `未发现明显根因 ✅`
      : rootCauses.map(r => `- **${r.severity.toUpperCase()}** [${r.type}] ${r.message} (置信度: ${r.confidence})`).join('\n'),
    ``,
    `## 💡 优化建议`,
    ``,
    recommendations.length === 0
      ? `暂无优化建议 ✅`
      : recommendations.map((r, i) => `${i + 1}. **[${r.priority.toUpperCase()}]** ${r.title}\n   ${r.description}\n   → **操作**: ${r.action}`).join('\n\n'),
    ``,
    `---`,
    `*报告由 ROS Trace Proxy 自动生成*`,
  ].join('\n')

  return {
    healthScore,
    reportMarkdown: report,
    summary: {
      totalTopics,
      totalMessages,
      totalThroughput: Math.round(totalThroughput * 10) / 10,
      avgLatency: Math.round(avgLatency * 10) / 10,
      maxP95,
      bottleneckCount: bottlenecks.length,
      anomalyCount: anomalies.length,
      rootCauseCount: rootCauses.length,
      recommendationCount: recommendations.length,
    },
  }
}

// ─── 导出 ──────────────────────────────────────────────

export {
  detectLatencyAnomalies,
  detectFrequencyAnomalies,
  detectLatencyTrend,
  rootCauseAnalysis,
  generateRecommendations,
  generateHealthReport,
}
