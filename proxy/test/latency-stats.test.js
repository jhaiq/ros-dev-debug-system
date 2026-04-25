/**
 * LatencyStats 测试 — 按话题延迟统计
 * 覆盖: record / get / getAll / 百分位计算 / 滑动窗口 / 多话题
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { LatencyStats } from '../src/utils.js'

describe('LatencyStats', () => {
  describe('构造函数', () => {
    it('初始 getAll 返回空数组', () => {
      const stats = new LatencyStats(100)
      assert.deepEqual(stats.getAll(), [])
    })

    it('未记录的话题 get 返回 null', () => {
      const stats = new LatencyStats(100)
      assert.equal(stats.get('/nonexistent'), null)
    })
  })

  describe('record', () => {
    it('记录单条数据后可获取统计', () => {
      const stats = new LatencyStats(100)
      stats.record('/scan', 15, 4096, 'sensor_msgs/LaserScan')
      const s = stats.get('/scan')
      assert.ok(s !== null)
      assert.equal(s.topic, '/scan')
      assert.equal(s.count, 1)
    })

    it('累计 count 正确', () => {
      const stats = new LatencyStats(100)
      for (let i = 0; i < 10; i++) {
        stats.record('/scan', 10, 100, 'std_msgs/String')
      }
      assert.equal(stats.get('/scan').count, 10)
    })

    it('记录不同 msgType', () => {
      const stats = new LatencyStats(100)
      stats.record('/scan', 10, 100, 'type_a')
      stats.record('/scan', 10, 100, 'type_b')
      const s = stats.get('/scan')
      assert.deepEqual(s.msgTypes.sort(), ['type_a', 'type_b'])
    })
  })

  describe('百分位计算', () => {
    it('计算准确的 p50 (索引 Math.floor(100*0.5)=50 → 值51)', () => {
      const stats = new LatencyStats(100)
      for (let i = 1; i <= 100; i++) {
        stats.record('/scan', i, 100, 'test')
      }
      const s = stats.get('/scan')
      // p50 = sorted[Math.floor(100*0.5)] = sorted[50] = 51
      assert.equal(s.p50, 51)
    })

    it('计算准确的 p90 (索引 Math.floor(100*0.9)=90 → 值91)', () => {
      const stats = new LatencyStats(100)
      for (let i = 1; i <= 100; i++) {
        stats.record('/scan', i, 100, 'test')
      }
      const s = stats.get('/scan')
      assert.equal(s.p90, 91)
    })

    it('计算准确的 p95 (索引 Math.floor(100*0.95)=95 → 值96)', () => {
      const stats = new LatencyStats(100)
      for (let i = 1; i <= 100; i++) {
        stats.record('/scan', i, 100, 'test')
      }
      const s = stats.get('/scan')
      assert.equal(s.p95, 96)
    })

    it('计算准确的 p99 (索引 Math.floor(100*0.99)=99 → 值100)', () => {
      const stats = new LatencyStats(100)
      for (let i = 1; i <= 100; i++) {
        stats.record('/scan', i, 100, 'test')
      }
      const s = stats.get('/scan')
      assert.equal(s.p99, 100)
    })

    it('min 和 max 正确', () => {
      const stats = new LatencyStats(100)
      stats.record('/scan', 5, 100, 'test')
      stats.record('/scan', 100, 100, 'test')
      stats.record('/scan', 50, 100, 'test')
      const s = stats.get('/scan')
      assert.equal(s.min, 5)
      assert.equal(s.max, 100)
    })

    it('avg 计算正确', () => {
      const stats = new LatencyStats(100)
      stats.record('/scan', 10, 100, 'test')
      stats.record('/scan', 20, 100, 'test')
      stats.record('/scan', 30, 100, 'test')
      const s = stats.get('/scan')
      assert.equal(s.avg, 20)
    })
  })

  describe('滑动窗口', () => {
    it('超出窗口大小的数据被丢弃', () => {
      const stats = new LatencyStats(5)
      for (let i = 0; i < 10; i++) {
        stats.record('/scan', i, 100, 'test')
      }
      const s = stats.get('/scan')
      // 窗口大小为 5，只保留最后 5 条 (5,6,7,8,9)
      assert.equal(s._recentLatencies.length, 5)
      assert.deepEqual(s._recentLatencies, [5, 6, 7, 8, 9])
    })

    it('窗口内百分位正确', () => {
      const stats = new LatencyStats(5)
      // 只记录 5 条
      stats.record('/scan', 10, 100, 'test')
      stats.record('/scan', 20, 100, 'test')
      stats.record('/scan', 30, 100, 'test')
      stats.record('/scan', 40, 100, 'test')
      stats.record('/scan', 50, 100, 'test')
      const s = stats.get('/scan')
      assert.equal(s.p50, 30)
    })
  })

  describe('多话题', () => {
    it('独立统计不同话题', () => {
      const stats = new LatencyStats(100)
      stats.record('/scan', 10, 100, 'test')
      stats.record('/odom', 20, 200, 'test')
      stats.record('/cmd_vel', 5, 50, 'test')

      assert.equal(stats.get('/scan').avg, 10)
      assert.equal(stats.get('/odom').avg, 20)
      assert.equal(stats.get('/cmd_vel').avg, 5)
    })

    it('getAll 返回所有话题', () => {
      const stats = new LatencyStats(100)
      stats.record('/scan', 10, 100, 'test')
      stats.record('/odom', 20, 200, 'test')
      const all = stats.getAll()
      assert.equal(all.length, 2)
      const topics = all.map(s => s.topic).sort()
      assert.deepEqual(topics, ['/cmd_vel', '/odom', '/scan'].filter(t => t === '/odom' || t === '/scan').sort())
      // 实际只记录了 /scan 和 /odom
      assert.deepEqual(topics, ['/odom', '/scan'])
    })

    it('avgSize 计算正确', () => {
      const stats = new LatencyStats(100)
      stats.record('/scan', 10, 1000, 'test')
      stats.record('/scan', 10, 3000, 'test')
      const s = stats.get('/scan')
      assert.equal(s.avgSize, 2000)
    })
  })

  describe('msgsPerSec', () => {
    it('计算消息速率', () => {
      const stats = new LatencyStats(100)
      // 先记录一条，等待 100ms，再记录剩余条
      stats.record('/scan', 10, 100, 'test')
      // 等待确保有非零时间差
      const start = Date.now()
      // Busy-wait to ensure time passes
      while (Date.now() - start < 100) {}
      for (let i = 1; i < 10; i++) {
        stats.record('/scan', 10, 100, 'test')
      }
      const s = stats.get('/scan')
      assert.ok(s.msgsPerSec > 0, 'msgsPerSec 应大于 0')
      assert.equal(s.count, 10)
    })
  })

  describe('边界条件', () => {
    it('空数据统计返回 count: 0', () => {
      const stats = new LatencyStats(100)
      // 手动创建一个空统计（通过直接操作内部状态模拟）
      stats.stats.set('/empty', {
        topic: '/empty',
        count: 0,
        latencies: [],
        msgTypes: new Set(),
        totalSize: 0,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
      })
      const s = stats.get('/empty')
      assert.equal(s.count, 0)
    })

    it('单条数据百分位等于该值', () => {
      const stats = new LatencyStats(100)
      stats.record('/scan', 42, 100, 'test')
      const s = stats.get('/scan')
      assert.equal(s.p50, 42)
      assert.equal(s.p99, 42)
    })
  })
})
