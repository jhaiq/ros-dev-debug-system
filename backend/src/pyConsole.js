/**
 * rqt_py_console 复刻后端 — 受控 Python REPL WebSocket
 * 启动 python3 进程，前端发送代码执行，stdout/stderr 回传。
 * 可注入 rclpy 初始化模板。
 */
import { spawn } from 'child_process'

const consoles = new Map() // ws -> { process, python }

const INIT_SCRIPT = `
import sys
print('Python', sys.version)
print('Tip: try "import rclpy; rclpy.init(); node = rclpy.create_node(\\'py_console\\')"')
print('>>> ', end='', flush=True)
`

export function setupPyConsoleWebSocket(wss) {
  wss.on('connection', (ws) => {
    const proc = spawn('python3', ['-i', '-q'], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    consoles.set(ws, proc)

    const send = (type, data) => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type, data }))
    }

    proc.stdout.on('data', d => send('stdout', d.toString()))
    proc.stderr.on('data', d => send('stderr', d.toString()))
    proc.on('close', () => {
      consoles.delete(ws)
      try { ws.close() } catch {}
    })

    // 写初始化提示
    proc.stdin.write(INIT_SCRIPT)

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw)
      if (msg.type === 'exec' && proc.stdin.writable) {
        proc.stdin.write(msg.code + '\n')
      }
    })

    ws.on('close', () => {
      proc.kill()
      consoles.delete(ws)
    })

    send('status', 'connected')
  })
}
