/**
 * rqt_shell 复刻后端 — WebSocket PTY
 * 为每个连接打开一个 bash shell，转发前端 <-> PTY。
 * 安全提示：仅在内网/可信环境开放（Q2）。
 */
import * as pty from 'node-pty'

const shells = new Map() // ws -> pty

export function setupShellWebSocket(wss) {
  wss.on('connection', (ws) => {
    // 默认启动 bash；如不可用则 sh
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash'
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME || '/tmp',
      env: { ...process.env, TERM: 'xterm-256color' },
    })

    shells.set(ws, ptyProcess)

    ptyProcess.onData(data => {
      if (ws.readyState === 1) ws.send(data)
    })

    ptyProcess.onExit(() => {
      shells.delete(ws)
      try { ws.close() } catch {}
    })

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data)
        if (msg.type === 'input') ptyProcess.write(msg.data)
        if (msg.type === 'resize') ptyProcess.resize(msg.cols || 80, msg.rows || 24)
      } catch {
        // 兼容纯文本输入
        ptyProcess.write(data.toString())
      }
    })

    ws.on('close', () => {
      ptyProcess.kill()
      shells.delete(ws)
    })

    // 发送初始提示
    ws.send(`\r\n# rqt_shell 已连接 (${shell})\r\n`)
  })
}
