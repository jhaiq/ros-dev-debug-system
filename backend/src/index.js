import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

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
    rosConnected
  })
})

// 静态文件服务（生产环境）
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '../../frontend/dist')))
  
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../../frontend/dist/index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`🚀 ROS Dev Debug Backend running on port ${PORT}`)
  console.log(`📡 Health check: http://localhost:${PORT}/health`)
})
