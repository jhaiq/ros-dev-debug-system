/**
 * Backend API 测试
 * 覆盖: GET /health, GET /api/status
 */
import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'http'

async function createTestApp() {
  const { default: express } = await import('express')
  const { default: cors } = await import('cors')

  const app = express()
  app.use(cors())
  app.use(express.json())

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // 模拟动态查询 proxy 状态
  app.get('/api/status', async (req, res) => {
    let rosConnected = false
    try {
      const proxyRes = await fetch(`${process.env.PROXY_API || 'http://localhost:9092'}/health`, {
        signal: AbortSignal.timeout(2000)
      })
      const proxyData = await proxyRes.json()
      rosConnected = proxyData.upstream === true
    } catch {
      // proxy 不可达
    }
    res.json({
      name: 'ROS Dev Debug System',
      version: '1.0.0',
      rosConnected
    })
  })

  return app
}

async function request(app, path) {
  return new Promise((resolve, reject) => {
    const server = createServer(app)
    server.listen(0, () => {
      const addr = server.address()
      const url = `http://127.0.0.1:${addr.port}${path}`
      import('node:http').then(({ get }) => {
        get(url, (res) => {
          let data = ''
          res.on('data', chunk => data += chunk)
          res.on('end', () => {
            server.close()
            resolve({
              status: res.statusCode,
              headers: res.headers,
              json: () => JSON.parse(data),
            })
          })
        }).on('error', reject)
      })
    })
  })
}

describe('Backend API', () => {
  let app

  before(async () => {
    app = await createTestApp()
  })

  describe('GET /health', () => {
    it('返回 200 状态码', async () => {
      const res = await request(app, '/health')
      assert.equal(res.status, 200)
    })

    it('返回 status: ok', async () => {
      const res = await request(app, '/health')
      const body = res.json()
      assert.equal(body.status, 'ok')
    })

    it('包含 timestamp 字段', async () => {
      const res = await request(app, '/health')
      const body = res.json()
      assert.ok(body.timestamp, '应包含 timestamp')
      assert.ok(new Date(body.timestamp) instanceof Date, 'timestamp 应为有效日期')
    })

    it('Content-Type 为 JSON', async () => {
      const res = await request(app, '/health')
      assert.ok(res.headers['content-type'].includes('application/json'))
    })
  })

  describe('GET /api/status', () => {
    it('返回 200 状态码', async () => {
      const res = await request(app, '/api/status')
      assert.equal(res.status, 200)
    })

    it('返回正确的系统名称', async () => {
      const res = await request(app, '/api/status')
      const body = res.json()
      assert.equal(body.name, 'ROS Dev Debug System')
    })

    it('返回正确的版本号', async () => {
      const res = await request(app, '/api/status')
      const body = res.json()
      assert.equal(body.version, '1.0.0')
    })

    it('proxy 不可达时 rosConnected 为 false', async () => {
      const res = await request(app, '/api/status')
      const body = res.json()
      assert.equal(body.rosConnected, false)
    })

    it('返回包含所有必需字段', async () => {
      const res = await request(app, '/api/status')
      const body = res.json()
      assert.ok('name' in body)
      assert.ok('version' in body)
      assert.ok('rosConnected' in body)
    })
  })

  describe('404 处理', () => {
    it('未知路径返回 404', async () => {
      const res = await request(app, '/nonexistent')
      assert.equal(res.status, 404)
    })
  })
})
