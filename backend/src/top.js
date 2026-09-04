/**
 * rqt_top 复刻后端 — 节点资源占用
 * 通过 ps 命令获取系统进程，按命令行中的节点名/话题名做启发式关联。
 */
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

function parsePs(stdout) {
  const lines = stdout.trim().split('\n')
  const header = lines[0] || ''
  const cpuIdx = header.toLowerCase().indexOf('%cpu')
  const memIdx = header.toLowerCase().indexOf('%mem')
  const cmdIdx = header.toLowerCase().indexOf('command')
  const rssIdx = header.toLowerCase().indexOf('rss')
  const pidIdx = header.toLowerCase().indexOf('pid')
  const results = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const parts = line.trim().split(/\s+/)
    if (parts.length < 11) continue
    const pid = parseInt(parts[0], 10)
    const cpu = parseFloat(parts[cpuIdx === 0 ? 2 : 8]) || 0
    const mem = parseFloat(parts[memIdx === 0 ? 3 : 9]) || 0
    const rss = parseInt(parts[rssIdx >= 0 ? rssIdx : 5], 10) || 0
    const command = parts.slice(10).join(' ')
    results.push({ pid, cpu, mem, rss: rss * 1024, command })
  }
  return results
}

/** 获取 ros2 节点名列表（作为提示） */
export async function getRosNodes() {
  try {
    const { stdout } = await execAsync('ros2 node list', { timeout: 5000 })
    return stdout.trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/** 返回所有进程 + 启发式节点名匹配 */
export async function getTopProcesses() {
  try {
    const { stdout } = await execAsync('ps aux --sort=-%cpu', { timeout: 5000 })
    return parsePs(stdout)
  } catch (e) {
    return []
  }
}

export async function getNodeTop() {
  const [processes, nodes] = await Promise.all([getTopProcesses(), getRosNodes()])
  const nodeMap = new Map()
  for (const node of nodes) {
    // 取节点名最后一段作为匹配关键词（如 /turtlesim -> turtlesim）
    const keyword = node.split('/').filter(Boolean).pop() || node
    const matches = processes.filter(p => p.command.includes(keyword) || p.command.includes(node))
    if (matches.length) {
      const cpu = matches.reduce((a, p) => a + p.cpu, 0)
      const mem = matches.reduce((a, p) => a + p.mem, 0)
      const rss = matches.reduce((a, p) => a + p.rss, 0)
      nodeMap.set(node, { node, cpu, mem, rss, processes: matches })
    } else {
      nodeMap.set(node, { node, cpu: 0, mem: 0, rss: 0, processes: [] })
    }
  }
  return Array.from(nodeMap.values())
}
