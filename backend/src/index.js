import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import {
  listBags, getBagInfo, startRecord, pauseRecord, stopRecord, listRecords,
  startPlay, pausePlay, stopPlay, listPlays,
} from './bag.js'
import { getNodeTop } from './top.js'
import { setupShellWebSocket } from './shell.js'
import { setupPyConsoleWebSocket } from './pyConsole.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 4000
const PROXY_API = process.env.PROXY_API || 'http://localhost:9092'

app.use(cors())
app.use(express.json())

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// API 路由 — 动态查询 proxy 状态获取真实的 rosConnected
app.get('/api/status', async (req, res) => {
  let rosConnected = false
  try {
    const proxyRes = await fetch(`${PROXY_API}/health`, { signal: AbortSignal.timeout(2000) })
    const proxyData = await proxyRes.json()
    rosConnected = proxyData.upstream === true
  } catch {
    // proxy 不可达，默认为 false
  }
  res.json({
    name: 'ROS Dev Debug System',
    version: '1.0.0',
    rosConnected,
  })
})

// --- rqt_bag REST API ---
app.get('/api/bags', async (req, res) => {
  try { res.json(await listBags()) } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/bags/:name/info', async (req, res) => {
  try { res.json(await getBagInfo(req.params.name)) } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/bags/record/start', (req, res) => {
  const { topics, all, name, compression } = req.body || {}
  try {
    const result = startRecord(topics || [], { all, name, compression })
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/bags/record/:id/pause', (req, res) => {
  const ok = pauseRecord(req.params.id, true)
  res.json({ success: ok, paused: true })
})

app.post('/api/bags/record/:id/resume', (req, res) => {
  const ok = pauseRecord(req.params.id, false)
  res.json({ success: ok, paused: false })
})

app.post('/api/bags/record/:id/stop', (req, res) => {
  const ok = stopRecord(req.params.id)
  res.json({ success: ok })
})

app.get('/api/bags/records', (req, res) => {
  res.json(listRecords())
})

app.post('/api/bags/play/start', (req, res) => {
  const { name, rate, loop } = req.body || {}
  try {
    const result = startPlay(name, { rate, loop })
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/bags/play/:id/pause', (req, res) => {
  const ok = pausePlay(req.params.id, true)
  res.json({ success: ok, paused: true })
})

app.post('/api/bags/play/:id/resume', (req, res) => {
  const ok = pausePlay(req.params.id, false)
  res.json({ success: ok, paused: false })
})

app.post('/api/bags/play/:id/stop', (req, res) => {
  const ok = stopPlay(req.params.id)
  res.json({ success: ok })
})

app.get('/api/bags/plays', (req, res) => {
  res.json(listPlays())
})

// --- rqt_top REST API ---
app.get('/api/top', async (req, res) => {
  try { res.json(await getNodeTop()) } catch (e) { res.status(500).json({ error: e.message }) }
})

// 静态文件服务（生产环境）
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '../../frontend/dist')))

  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../../frontend/dist/index.html'))
  })
}

const server = createServer(app)

// --- WebSocket 服务 ---
const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (ws, req) => {
  const pathname = req.url || ''
  if (pathname.startsWith('/ws/shell')) {
    // 由 shell 子路由器处理
  } else if (pathname.startsWith('/ws/pyconsole')) {
    // 由 pyconsole 子路由器处理
  }
})

// 使用子路径 WebSocket 服务器
const shellWss = new WebSocketServer({ server, path: '/ws/shell' })
setupShellWebSocket(shellWss)

const pyWss = new WebSocketServer({ server, path: '/ws/pyconsole' })
setupPyConsoleWebSocket(pyWss)

server.listen(PORT, () => {
  console.log(`🚀 ROS Dev Debug Backend running on port ${PORT}`)
  console.log(`📡 Health check: http://localhost:${PORT}/health`)
  console.log(`🎬 Bag API: http://localhost:${PORT}/api/bags`)
  console.log(`📊 Top API: http://localhost:${PORT}/api/top`)
  console.log(`🖥️ Shell WS: ws://localhost:${PORT}/ws/shell`)
  console.log(`🐍 PyConsole WS: ws://localhost:${PORT}/ws/pyconsole`)
})
