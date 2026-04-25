/**
 * 瓶颈检测 & 工具函数测试
 * 覆盖: detectBottlenecks / getSuggestion / parseJson
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { detectBottlenecks, getSuggestion, parseJson, BOTTLENECK_RULES } from '../src/utils.js'

// ─── 辅助函数 ──────────────────────────────────────────

function makeStats(overrides = {}) {
  return {
    topic: '/scan',
    count: 100,
    avg: 15,
    min: 5,
    max: 89,
    p50: 14,
    p90: 28,
    p95: 35,
    p99: 52,
    msgsPerSec: 10.2,
    avgSize: 4096,
    ...overrides,
  }
}

// ─── detectBottlenecks ─────────────────────────────────

describe('detectBottlenecks', () => {
  describe('健康系统无瓶颈', () => {
    it('正常延迟不触发瓶颈', () => {
      const stats = [makeStats()]
      const bottlenecks = detectBottlenecks(stats)
      assert.equal(bottlenecks.length, 0)
    })

    it('低消息频率不触发瓶颈', () => {
      const stats = [makeStats({ msgsPerSec: 5, p50: 5 })]
      const bottlenecks = detectBottlenecks(stats)
      assert.equal(bottlenecks.length, 0)
    })
  })

  describe('高频延迟', () => {
    it('p95 > 100 且 count > 50 触发 critical', () => {
      const stats = [makeStats({ p95: 150, count: 100 })]
      const bottlenecks = detectBottlenecks(stats)
      assert.ok(bottlenecks.length > 0)
      const bn = bottlenecks.find(b => b.rule === '高频延迟')
      assert.ok(bn, '应检出高频延迟')
      assert.equal(bn.severity, 'critical')
      assert.equal(bn.topic, '/scan')
    })

    it('p95 > 100 但 count <= 50 不触发', () => {
      const stats = [makeStats({ p95: 150, count: 30 })]
      const bottlenecks = detectBottlenecks(stats)
      const bn = bottlenecks.find(b => b.rule === '高频延迟')
      assert.equal(bn, undefined)
    })
  })

  describe('延迟尖峰', () => {
    it('max > p99 * 3 且 max > 200 触发 warning', () => {
      const stats = [makeStats({ p99: 50, max: 300 })]
      const bottlenecks = detectBottlenecks(stats)
      const bn = bottlenecks.find(b => b.rule === '延迟尖峰')
      assert.ok(bn, '应检出延迟尖峰')
      assert.equal(bn.severity, 'warning')
    })

    it('max > p99 * 3 但 max <= 200 不触发', () => {
      const stats = [makeStats({ p99: 50, max: 150 })]
      const bottlenecks = detectBottlenecks(stats)
      const bn = bottlenecks.find(b => b.rule === '延迟尖峰')
      assert.equal(bn, undefined)
    })
  })

  describe('消息堆积', () => {
    it('msgsPerSec > 100 且 p50 > 50 触发 critical', () => {
      const stats = [makeStats({ msgsPerSec: 150, p50: 60 })]
      const bottlenecks = detectBottlenecks(stats)
      const bn = bottlenecks.find(b => b.rule === '消息堆积')
      assert.ok(bn, '应检出消息堆积')
      assert.equal(bn.severity, 'critical')
    })

    it('高频率但低延迟不触发', () => {
      const stats = [makeStats({ msgsPerSec: 150, p50: 10 })]
      const bottlenecks = detectBottlenecks(stats)
      const bn = bottlenecks.find(b => b.rule === '消息堆积')
      assert.equal(bn, undefined)
    })
  })

  describe('大消息', () => {
    it('avgSize > 1MB 触发 warning', () => {
      const stats = [makeStats({ avgSize: 2 * 1024 * 1024 })]
      const bottlenecks = detectBottlenecks(stats)
      const bn = bottlenecks.find(b => b.rule === '大消息')
      assert.ok(bn, '应检出大消息')
      assert.equal(bn.severity, 'warning')
    })

    it('avgSize < 1MB 不触发', () => {
      const stats = [makeStats({ avgSize: 500 * 1024 })]
      const bottlenecks = detectBottlenecks(stats)
      const bn = bottlenecks.find(b => b.rule === '大消息')
      assert.equal(bn, undefined)
    })
  })

  describe('多瓶颈排序', () => {
    it('critical 排在 warning 前面', () => {
      const stats = [
        makeStats({ topic: '/a', p95: 150, count: 100, avgSize: 2 * 1024 * 1024 }),
      ]
      const bottlenecks = detectBottlenecks(stats)
      if (bottlenecks.length >= 2) {
        const severityOrder = { critical: 0, warning: 1, info: 2 }
        for (let i = 1; i < bottlenecks.length; i++) {
          assert.ok(
            severityOrder[bottlenecks[i - 1].severity] <= severityOrder[bottlenecks[i].severity],
            '应按严重程度排序'
          )
        }
      }
    })
  })

  describe('details 完整性', () => {
    it('瓶颈包含所有必需的 details 字段', () => {
      const stats = [makeStats({ p95: 150, count: 100 })]
      const bottlenecks = detectBottlenecks(stats)
      const bn = bottlenecks[0]
      assert.ok(bn.details.p50 !== undefined)
      assert.ok(bn.details.p95 !== undefined)
      assert.ok(bn.details.p99 !== undefined)
      assert.ok(bn.details.max !== undefined)
      assert.ok(bn.details.avg !== undefined)
      assert.ok(bn.details.msgsPerSec !== undefined)
      assert.ok(bn.details.avgSize !== undefined)
      assert.ok(bn.details.count !== undefined)
    })
  })

  describe('自定义规则', () => {
    it('使用自定义规则检测', () => {
      const customRules = [
        { name: '超高延迟', check: s => s.p95 > 50, severity: 'info' },
      ]
      const stats = [makeStats({ p95: 60, count: 10 })]
      const bottlenecks = detectBottlenecks(stats, customRules)
      assert.ok(bottlenecks.length > 0)
      assert.equal(bottlenecks[0].rule, '超高延迟')
      assert.equal(bottlenecks[0].severity, 'info')
    })
  })
})

// ─── getSuggestion ─────────────────────────────────────

describe('getSuggestion', () => {
  it('高频延迟返回 throttle_rate 建议', () => {
      const stat = makeStats({ p95: 150 })
      const s = getSuggestion('高频延迟', stat)
      assert.ok(s.includes('throttle_rate'))
      assert.ok(s.includes('/scan'))
    })

  it('延迟尖峰返回网络检查建议', () => {
    const stat = makeStats({ max: 300 })
    const s = getSuggestion('延迟尖峰', stat)
    assert.ok(s.includes('延迟尖峰'))
    assert.ok(s.includes('max='))
  })

  it('消息堆积返回压缩/分流建议', () => {
    const stat = makeStats({ msgsPerSec: 150 })
    const s = getSuggestion('消息堆积', stat)
    assert.ok(s.includes('压缩') || s.includes('分流'))
  })

  it('大消息返回 compressed 建议', () => {
    const stat = makeStats({ avgSize: 2 * 1024 * 1024 })
    const s = getSuggestion('大消息', stat)
    assert.ok(s.includes('compressed') || s.includes('KB'))
  })

  it('未知规则返回默认建议', () => {
    const stat = makeStats()
    const s = getSuggestion('未知规则', stat)
    assert.ok(s.includes('建议检查'))
  })
})

// ─── parseJson ─────────────────────────────────────────

describe('parseJson', () => {
  it('解析有效 JSON 字符串', () => {
    const result = parseJson('{"op": "publish", "topic": "/scan"}')
    assert.deepEqual(result, { op: 'publish', topic: '/scan' })
  })

  it('解析 Buffer 对象', () => {
    const buf = Buffer.from('{"test": true}')
    const result = parseJson(buf)
    assert.deepEqual(result, { test: true })
  })

  it('无效 JSON 返回 null', () => {
    assert.equal(parseJson('not json'), null)
    assert.equal(parseJson('{invalid}'), null)
    assert.equal(parseJson(''), null)
  })

  it('null 和 undefined 返回 null', () => {
    assert.equal(parseJson(null), null)
    assert.equal(parseJson(undefined), null)
  })

  it('解析复杂嵌套对象', () => {
    const input = '{"op":"msg","msg":{"data":[1,2,3],"header":{"seq":1}}}'
    const result = parseJson(input)
    assert.equal(result.op, 'msg')
    assert.deepEqual(result.msg.data, [1, 2, 3])
    assert.equal(result.msg.header.seq, 1)
  })

  it('解析数组', () => {
    const result = parseJson('[1, 2, 3]')
    assert.deepEqual(result, [1, 2, 3])
  })
})

// ─── BOTTLENECK_RULES 常量 ────────────────────────────

describe('BOTTLENECK_RULES', () => {
  it('定义了 4 条规则', () => {
    assert.equal(BOTTLENECK_RULES.length, 4)
  })

  it('每条规则都有必需的字段', () => {
    for (const rule of BOTTLENECK_RULES) {
      assert.ok(rule.name, '规则应有 name')
      assert.ok(typeof rule.check === 'function', '规则应有 check 函数')
      assert.ok(rule.severity, '规则应有 severity')
      assert.ok(['critical', 'warning', 'info'].includes(rule.severity), 'severity 应合法')
    }
  })

  it('规则名称唯一', () => {
    const names = BOTTLENECK_RULES.map(r => r.name)
    assert.equal(new Set(names).size, names.length, '规则名称不应重复')
  })
})
