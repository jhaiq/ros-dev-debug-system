/**
 * 诊断引擎测试 — diagnostics.js
 * 覆盖: 异常检测 / 频率异常 / 延迟趋势 / 根因分析 / 优化建议 / 健康报告
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  detectLatencyAnomalies,
  detectFrequencyAnomalies,
  detectLatencyTrend,
  rootCauseAnalysis,
  generateRecommendations,
  generateHealthReport,
} from '../src/diagnostics.js'

// ─── 辅助函数 ──────────────────────────────────────────

function makeStats(overrides = {}) {
  return {
    topic: '/scan',
    count: 1000,
    avg: 15,
    min: 5,
    max: 89,
    p50: 14,
    p90: 28,
    p95: 35,
    p99: 52,
    msgsPerSec: 10.2,
    avgSize: 4096,
    lastSeen: Date.now(),
    _recentLatencies: Array.from({ length: 50 }, () => 15 + Math.random() * 10),
    ...overrides,
  }
}

// ─── detectLatencyAnomalies ────────────────────────────

test('detectLatencyAnomalies: 正常延迟无异常', () => {
  const stats = [makeStats()]
  const anomalies = detectLatencyAnomalies(stats)
  assert.equal(anomalies.length, 0)
})

test('detectLatencyAnomalies: 延迟超过 2σ 检出异常', () => {
  const latencies = Array(50).fill(10)
  const stats = [makeStats({
    p95: 200,
    _recentLatencies: latencies,
    count: 100,
  })]
  const anomalies = detectLatencyAnomalies(stats)
  assert.ok(anomalies.length > 0, '应检出异常')
  assert.equal(anomalies[0].type, 'latency_spike')
  assert.equal(anomalies[0].topic, '/scan')
})

test('detectLatencyAnomalies: 数据不足跳过', () => {
  const stats = [makeStats({ count: 5, _recentLatencies: [1, 2, 3] })]
  const anomalies = detectLatencyAnomalies(stats)
  assert.equal(anomalies.length, 0)
})

test('detectLatencyAnomalies: 3σ+ 标记为 critical', () => {
  const latencies = Array(50).fill(10)
  const stats = [makeStats({
    p95: 500,
    _recentLatencies: latencies,
    count: 100,
  })]
  const anomalies = detectLatencyAnomalies(stats)
  assert.equal(anomalies[0].severity, 'critical')
})

// ─── detectFrequencyAnomalies ──────────────────────────

test('detectFrequencyAnomalies: 频率正常无异常', () => {
  const stats = [makeStats({ msgsPerSec: 10 })]
  const expected = { '/scan': 10 }
  const anomalies = detectFrequencyAnomalies(stats, expected)
  assert.equal(anomalies.length, 0)
})

test('detectFrequencyAnomalies: 频率突增检出', () => {
  const stats = [makeStats({ msgsPerSec: 50, count: 100 })]
  const expected = { '/scan': 10 }
  const anomalies = detectFrequencyAnomalies(stats, expected)
  assert.ok(anomalies.length > 0)
  assert.equal(anomalies[0].type, 'frequency_anomaly')
  assert.equal(anomalies[0].direction, '突增')
})

test('detectFrequencyAnomalies: 频率突降检出', () => {
  const stats = [makeStats({ msgsPerSec: 2, count: 100 })]
  const expected = { '/scan': 10 }
  const anomalies = detectFrequencyAnomalies(stats, expected)
  assert.ok(anomalies.length > 0)
  assert.equal(anomalies[0].direction, '突降')
})

test('detectFrequencyAnomalies: 无期望频率跳过', () => {
  const stats = [makeStats()]
  const anomalies = detectFrequencyAnomalies(stats, {})
  assert.equal(anomalies.length, 0)
})

// ─── detectLatencyTrend ────────────────────────────────

test('detectLatencyTrend: 持续上升检出', () => {
  const latencies = Array.from({ length: 30 }, (_, i) => i * 5)
  const stats = [makeStats({ _recentLatencies: latencies })]
  const anomalies = detectLatencyTrend(stats)
  assert.ok(anomalies.length > 0)
  assert.equal(anomalies[0].type, 'latency_trend')
})

test('detectLatencyTrend: 稳定无异常', () => {
  const latencies = Array(30).fill(15)
  const stats = [makeStats({ _recentLatencies: latencies })]
  const anomalies = detectLatencyTrend(stats)
  assert.equal(anomalies.length, 0)
})

test('detectLatencyTrend: 数据不足跳过', () => {
  const latencies = Array(10).fill(0).map((_, i) => i * 10)
  const stats = [makeStats({ _recentLatencies: latencies })]
  const anomalies = detectLatencyTrend(stats)
  assert.equal(anomalies.length, 0)
})

// ─── rootCauseAnalysis ─────────────────────────────────

test('rootCauseAnalysis: 上游高频导致下游延迟', () => {
  const bottlenecks = [
    { topic: '/odom', details: { msgsPerSec: 5 } },
    { topic: '/cmd_vel', details: { msgsPerSec: 3 } },
  ]
  const topicStats = [makeStats({ topic: '/scan', msgsPerSec: 100, p95: 50 })]
  const causes = rootCauseAnalysis(bottlenecks, topicStats)
  assert.ok(causes.length > 0)
  assert.equal(causes[0].type, 'upstream_cascade')
})

test('rootCauseAnalysis: 大消息导致拥塞', () => {
  const bottlenecks = []
  const topicStats = [makeStats({
    topic: '/camera/image_raw',
    avgSize: 2 * 1024 * 1024,
    count: 100,
  })]
  const causes = rootCauseAnalysis(bottlenecks, topicStats)
  assert.ok(causes.length > 0)
  assert.equal(causes[0].type, 'large_message')
})

test('rootCauseAnalysis: 健康系统无根因', () => {
  const bottlenecks = []
  const topicStats = [makeStats({ msgsPerSec: 5, avgSize: 1024 })]
  const causes = rootCauseAnalysis(bottlenecks, topicStats)
  assert.equal(causes.length, 0)
})

// ─── generateRecommendations ───────────────────────────

test('generateRecommendations: 高频高延迟建议限流', () => {
  const stats = [makeStats({ msgsPerSec: 50, p50: 30, p95: 150, count: 1000 })]
  const recs = generateRecommendations(stats, [], [])
  const throttle = recs.find(r => r.type === 'throttle')
  assert.ok(throttle, '应有限流建议')
  assert.ok(throttle.action.includes('throttle_rate'))
})

test('generateRecommendations: 大消息建议压缩', () => {
  const stats = [makeStats({ avgSize: 200 * 1024, count: 100 })]
  const recs = generateRecommendations(stats, [], [])
  const compress = recs.find(r => r.type === 'compression')
  assert.ok(compress, '应有压缩建议')
})

test('generateRecommendations: 高延迟建议 QoS', () => {
  const stats = [makeStats({ p95: 250, count: 200 })]
  const recs = generateRecommendations(stats, [], [])
  const qos = recs.find(r => r.type === 'qos')
  assert.ok(qos, '应有 QoS 建议')
})

test('generateRecommendations: 健康系统无建议', () => {
  const stats = [makeStats({ msgsPerSec: 5, p50: 5, p95: 10, avgSize: 1024, count: 50 })]
  const recs = generateRecommendations(stats, [], [])
  assert.equal(recs.length, 0)
})

test('generateRecommendations: 按优先级排序', () => {
  const stats = [
    makeStats({ topic: '/a', msgsPerSec: 50, p50: 30, p95: 150, count: 1000 }),
    makeStats({ topic: '/b', avgSize: 200 * 1024, count: 100 }),
  ]
  const recs = generateRecommendations(stats, [], [])
  if (recs.length >= 2) {
    const order = { high: 0, medium: 1, low: 2 }
    for (let i = 1; i < recs.length; i++) {
      assert.ok(
        order[recs[i - 1].priority] <= order[recs[i].priority],
        '应按优先级排序'
      )
    }
  }
})

// ─── generateHealthReport ──────────────────────────────

test('generateHealthReport: 生成有效报告', () => {
  const stats = [makeStats()]
  const report = generateHealthReport(stats, [], [], [], [])
  assert.ok(report.healthScore >= 0 && report.healthScore <= 100)
  assert.ok(report.reportMarkdown.includes('# ROS 系统健康诊断报告'))
  assert.ok(report.reportMarkdown.includes('## 📊 系统概览'))
  assert.equal(report.summary.totalTopics, 1)
})

test('generateHealthReport: 瓶颈降低健康分', () => {
  const stats = [makeStats({ p95: 150, count: 100 })]
  const bottlenecks = [
    { severity: 'critical', topic: '/scan', rule: '高频延迟', details: { p95: 150 } },
  ]
  const reportHealthy = generateHealthReport(stats, [], [], [], [])
  const reportWithBottleneck = generateHealthReport(stats, bottlenecks, [], [], [])
  assert.ok(reportWithBottleneck.healthScore < reportHealthy.healthScore)
})

test('generateHealthReport: 异常降低健康分', () => {
  const stats = [makeStats()]
  const anomalies = [
    { type: 'latency_spike', topic: '/scan', severity: 'critical', message: 'test', timestamp: Date.now() },
  ]
  const reportHealthy = generateHealthReport(stats, [], [], [], [])
  const reportWithAnomaly = generateHealthReport(stats, [], anomalies, [], [])
  assert.ok(reportWithAnomaly.healthScore < reportHealthy.healthScore)
})

test('generateHealthReport: 报告包含所有章节', () => {
  const stats = [makeStats()]
  const bottlenecks = [{ severity: 'warning', topic: '/scan', rule: 'test', details: { p95: 50 } }]
  const report = generateHealthReport(stats, bottlenecks, [], [], [])
  assert.ok(report.reportMarkdown.includes('## 🛡️ 瓶颈检测'))
  assert.ok(report.reportMarkdown.includes('## ⚠️ 异常检测'))
  assert.ok(report.reportMarkdown.includes('## 🔍 根因分析'))
  assert.ok(report.reportMarkdown.includes('## 💡 优化建议'))
})

test('generateHealthReport: 摘要统计准确', () => {
  const stats = [makeStats(), makeStats({ topic: '/odom' })]
  const bottlenecks = [{ severity: 'warning', topic: '/scan', rule: 'test', details: { p95: 50 } }]
  const anomalies = [{ type: 'test', topic: '/scan', severity: 'warning', message: 't', timestamp: Date.now() }]
  const recs = [{ id: 'r1', type: 'throttle', priority: 'high', topic: '/scan', title: 't', description: 'd', action: 'a', expectedImpact: 'e', confidence: 'high' }]
  const causes = [{ type: 'test', severity: 'warning', message: 't', confidence: 'medium' }]
  const report = generateHealthReport(stats, bottlenecks, anomalies, recs, causes)
  assert.equal(report.summary.totalTopics, 2)
  assert.equal(report.summary.bottleneckCount, 1)
  assert.equal(report.summary.anomalyCount, 1)
  assert.equal(report.summary.recommendationCount, 1)
  assert.equal(report.summary.rootCauseCount, 1)
})
