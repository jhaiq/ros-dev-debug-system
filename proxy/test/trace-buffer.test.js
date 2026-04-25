/**
 * TraceBuffer 测试 — 环形缓冲区
 * 覆盖: add / get / getAll / filter / LRU 淘汰 / 边界条件
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TraceBuffer } from '../src/utils.js'

// ─── 辅助函数 ──────────────────────────────────────────

function makeTrace(overrides = {}) {
  return {
    trace_id: `trace-${Date.now()}-${Math.random()}`,
    topic: '/scan',
    node: 'lidar_driver',
    msg_type: 'sensor_msgs/LaserScan',
    publish_ts: Date.now(),
    subscribe_ts: Date.now() + 15,
    latency_ms: 15,
    hop_count: 1,
    msg_size_bytes: 4096,
    ...overrides,
  }
}

describe('TraceBuffer', () => {
  describe('构造函数', () => {
    it('初始 size 为 0', () => {
      const buf = new TraceBuffer(100)
      assert.equal(buf.size, 0)
    })
  })

  describe('add / get', () => {
    it('添加后可获取', () => {
      const buf = new TraceBuffer(100)
      const trace = makeTrace({ trace_id: 't1' })
      buf.add(trace)
      const result = buf.get('t1')
      assert.deepEqual(result, trace)
    })

    it('不存在的 ID 返回 null', () => {
      const buf = new TraceBuffer(100)
      assert.equal(buf.get('nonexistent'), null)
    })

    it('添加多条后可分别获取', () => {
      const buf = new TraceBuffer(100)
      const t1 = makeTrace({ trace_id: 't1', topic: '/scan' })
      const t2 = makeTrace({ trace_id: 't2', topic: '/odom' })
      buf.add(t1)
      buf.add(t2)
      assert.equal(buf.get('t1').topic, '/scan')
      assert.equal(buf.get('t2').topic, '/odom')
    })

    it('覆盖相同 trace_id', () => {
      const buf = new TraceBuffer(100)
      buf.add(makeTrace({ trace_id: 't1', topic: '/scan' }))
      buf.add(makeTrace({ trace_id: 't1', topic: '/odom' }))
      assert.equal(buf.get('t1').topic, '/odom')
      assert.equal(buf.size, 1)
    })
  })

  describe('getAll', () => {
    it('返回最近插入的顺序（倒序）', () => {
      const buf = new TraceBuffer(100)
      buf.add(makeTrace({ trace_id: 't1' }))
      buf.add(makeTrace({ trace_id: 't2' }))
      buf.add(makeTrace({ trace_id: 't3' }))
      const all = buf.getAll()
      assert.equal(all[0].trace_id, 't3')
      assert.equal(all[1].trace_id, 't2')
      assert.equal(all[2].trace_id, 't1')
    })

    it('limit 限制返回数量', () => {
      const buf = new TraceBuffer(100)
      for (let i = 0; i < 10; i++) {
        buf.add(makeTrace({ trace_id: `t${i}` }))
      }
      const all = buf.getAll(3)
      assert.equal(all.length, 3)
      assert.equal(all[0].trace_id, 't9')
    })

    it('空缓冲区返回空数组', () => {
      const buf = new TraceBuffer(100)
      assert.deepEqual(buf.getAll(), [])
    })
  })

  describe('filter', () => {
    it('按 topic 过滤', () => {
      const buf = new TraceBuffer(100)
      buf.add(makeTrace({ trace_id: 't1', topic: '/scan' }))
      buf.add(makeTrace({ trace_id: 't2', topic: '/odom' }))
      buf.add(makeTrace({ trace_id: 't3', topic: '/scan' }))
      const results = buf.filter({ topic: '/scan' })
      assert.equal(results.length, 2)
      results.forEach(r => assert.equal(r.topic, '/scan'))
    })

    it('按 node 过滤', () => {
      const buf = new TraceBuffer(100)
      buf.add(makeTrace({ trace_id: 't1', node: 'lidar' }))
      buf.add(makeTrace({ trace_id: 't2', node: 'camera' }))
      const results = buf.filter({ node: 'lidar' })
      assert.equal(results.length, 1)
      assert.equal(results[0].node, 'lidar')
    })

    it('按 minLatency 过滤', () => {
      const buf = new TraceBuffer(100)
      buf.add(makeTrace({ trace_id: 't1', latency_ms: 10 }))
      buf.add(makeTrace({ trace_id: 't2', latency_ms: 50 }))
      buf.add(makeTrace({ trace_id: 't3', latency_ms: 100 }))
      const results = buf.filter({ minLatency: 50 })
      assert.equal(results.length, 2)
      results.forEach(r => assert.ok(r.latency_ms >= 50))
    })

    it('按 maxLatency 过滤', () => {
      const buf = new TraceBuffer(100)
      buf.add(makeTrace({ trace_id: 't1', latency_ms: 10 }))
      buf.add(makeTrace({ trace_id: 't2', latency_ms: 50 }))
      buf.add(makeTrace({ trace_id: 't3', latency_ms: 100 }))
      const results = buf.filter({ maxLatency: 50 })
      assert.equal(results.length, 2)
      results.forEach(r => assert.ok(r.latency_ms <= 50))
    })

    it('按时间范围过滤', () => {
      const buf = new TraceBuffer(100)
      buf.add(makeTrace({ trace_id: 't1', publish_ts: 1000 }))
      buf.add(makeTrace({ trace_id: 't2', publish_ts: 2000 }))
      buf.add(makeTrace({ trace_id: 't3', publish_ts: 3000 }))
      const results = buf.filter({ timeFrom: 1500, timeTo: 2500 })
      assert.equal(results.length, 1)
      assert.equal(results[0].trace_id, 't2')
    })

    it('组合过滤', () => {
      const buf = new TraceBuffer(100)
      buf.add(makeTrace({ trace_id: 't1', topic: '/scan', latency_ms: 10 }))
      buf.add(makeTrace({ trace_id: 't2', topic: '/scan', latency_ms: 100 }))
      buf.add(makeTrace({ trace_id: 't3', topic: '/odom', latency_ms: 100 }))
      const results = buf.filter({ topic: '/scan', minLatency: 50 })
      assert.equal(results.length, 1)
      assert.equal(results[0].trace_id, 't2')
    })

    it('无条件返回全部', () => {
      const buf = new TraceBuffer(100)
      buf.add(makeTrace({ trace_id: 't1' }))
      buf.add(makeTrace({ trace_id: 't2' }))
      const results = buf.filter({})
      assert.equal(results.length, 2)
    })
  })

  describe('LRU 淘汰', () => {
    it('超过 maxSize 淘汰最旧的', () => {
      const buf = new TraceBuffer(3)
      buf.add(makeTrace({ trace_id: 't1' }))
      buf.add(makeTrace({ trace_id: 't2' }))
      buf.add(makeTrace({ trace_id: 't3' }))
      // 添加第 4 条，淘汰 t1
      buf.add(makeTrace({ trace_id: 't4' }))
      assert.equal(buf.size, 3)
      assert.equal(buf.get('t1'), null)
      assert.ok(buf.get('t2') !== null)
      assert.ok(buf.get('t4') !== null)
    })

    it('大量插入只保留最新', () => {
      const buf = new TraceBuffer(10)
      for (let i = 0; i < 100; i++) {
        buf.add(makeTrace({ trace_id: `t${i}` }))
      }
      assert.equal(buf.size, 10)
      // 最新的 10 条应保留 (t90-t99)
      assert.equal(buf.get('t99').trace_id, 't99')
      assert.equal(buf.get('t90').trace_id, 't90')
      assert.equal(buf.get('t89'), null)
    })
  })

  describe('size', () => {
    it('正确反映条目数', () => {
      const buf = new TraceBuffer(100)
      assert.equal(buf.size, 0)
      buf.add(makeTrace({ trace_id: 't1' }))
      assert.equal(buf.size, 1)
      buf.add(makeTrace({ trace_id: 't2' }))
      assert.equal(buf.size, 2)
    })

    it('淘汰后 size 正确', () => {
      const buf = new TraceBuffer(2)
      buf.add(makeTrace({ trace_id: 't1' }))
      buf.add(makeTrace({ trace_id: 't2' }))
      buf.add(makeTrace({ trace_id: 't3' }))
      assert.equal(buf.size, 2)
    })
  })

  describe('大数据量性能', () => {
    it('10000 条插入不崩溃', () => {
      const buf = new TraceBuffer(10000)
      for (let i = 0; i < 10000; i++) {
        buf.add(makeTrace({ trace_id: `t${i}` }))
      }
      assert.equal(buf.size, 10000)
    })

    it('filter 在大数据量下仍正确', () => {
      const buf = new TraceBuffer(1000)
      for (let i = 0; i < 500; i++) {
        buf.add(makeTrace({ trace_id: `scan-${i}`, topic: '/scan', latency_ms: 10 + i }))
      }
      for (let i = 0; i < 500; i++) {
        buf.add(makeTrace({ trace_id: `odom-${i}`, topic: '/odom', latency_ms: 5 + i }))
      }
      const scanResults = buf.filter({ topic: '/scan', minLatency: 100 })
      assert.ok(scanResults.length > 0)
      scanResults.forEach(r => {
        assert.equal(r.topic, '/scan')
        assert.ok(r.latency_ms >= 100)
      })
    })
  })
})
