/**
 * Phase B 后端 API 测试 — bag / top 路由
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import express from 'express'

// 提取 Express 应用（不含 listen），通过动态 import 并 mock 子模块
process.env.BAG_DIR = '/tmp/test_bags_' + Date.now()

const bag = await import('../src/bag.js')
const top = await import('../src/top.js')

// 构建测试 app（复制 index.js 的路由逻辑，避免监听端口）
function buildApp() {
  const app = express()
  app.use(express.json())

  app.get('/api/bags', async (req, res) => {
    try { res.json(await bag.listBags()) } catch (e) { res.status(500).json({ error: e.message }) }
  })
  app.get('/api/bags/records', (req, res) => res.json(bag.listRecords()))
  app.get('/api/bags/plays', (req, res) => res.json(bag.listPlays()))
  app.post('/api/bags/record/start', (req, res) => {
    const { topics, all } = req.body || {}
    try { res.json(bag.startRecord(topics || [], { all })) } catch (e) { res.status(500).json({ error: e.message }) }
  })
  app.post('/api/bags/record/:id/pause', (req, res) => res.json({ success: bag.pauseRecord(req.params.id, true) }))
  app.post('/api/bags/record/:id/resume', (req, res) => res.json({ success: bag.pauseRecord(req.params.id, false) }))
  app.post('/api/bags/record/:id/stop', (req, res) => res.json({ success: bag.stopRecord(req.params.id) }))
  app.post('/api/bags/play/start', (req, res) => {
    try { res.json(bag.startPlay(req.body.name, { rate: req.body.rate })) } catch (e) { res.status(500).json({ error: e.message }) }
  })
  app.post('/api/bags/play/:id/pause', (req, res) => res.json({ success: bag.pausePlay(req.params.id, true) }))
  app.post('/api/bags/play/:id/stop', (req, res) => res.json({ success: bag.stopPlay(req.params.id) }))
  app.get('/api/top', async (req, res) => {
    try { res.json(await top.getNodeTop()) } catch (e) { res.status(500).json({ error: e.message }) }
  })
  return app
}

describe('Bag API', () => {
  let app
  before(() => { app = buildApp() })

  it('GET /api/bags 返回数组', async () => {
    const res = await request(app).get('/api/bags')
    assert.strictEqual(res.status, 200)
    assert.ok(Array.isArray(res.body))
  })

  it('POST /api/bags/record/start 返回 id 与 outputName', async () => {
    const res = await request(app).post('/api/bags/record/start').send({ all: true })
    assert.strictEqual(res.status, 200)
    assert.ok(res.body.id)
    assert.ok(res.body.outputName)
    // 停止清理
    await request(app).post(`/api/bags/record/${res.body.id}/stop`)
  })

  it('GET /api/bags/records 返回活动录制列表', async () => {
    const res = await request(app).get('/api/bags/records')
    assert.strictEqual(res.status, 200)
    assert.ok(Array.isArray(res.body))
  })

  it('POST /api/bags/record/:id/pause 对不存在 id 返回 success:false', async () => {
    const res = await request(app).post('/api/bags/record/nonexistent/pause')
    assert.strictEqual(res.body.success, false)
  })

  it('POST /api/bags/play/:id/stop 对不存在 id 返回 success:false', async () => {
    const res = await request(app).post('/api/bags/play/nonexistent/stop')
    assert.strictEqual(res.body.success, false)
  })
})

describe('Top API', () => {
  let app
  before(() => { app = buildApp() })

  it('GET /api/top 返回数组（无 ros2 环境下也应有响应）', async () => {
    const res = await request(app).get('/api/top')
    assert.strictEqual(res.status, 200)
    assert.ok(Array.isArray(res.body))
  })
})
