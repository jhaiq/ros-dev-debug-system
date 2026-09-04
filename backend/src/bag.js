/**
 * rqt_bag 复刻后端 — bag 录制/回放管理
 * 通过 ros2 bag CLI 执行，维护录制/回放进程状态。
 */
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'

const BAG_DIR = process.env.BAG_DIR || '/tmp/rosbags'

const activeRecords = new Map() // id -> { process, topics, startedAt, paused, outputDir }
const activePlays = new Map()   // id -> { process, file, startedAt, paused, rate }

function generateId() {
  return Math.random().toString(36).slice(2)
}

/** 解析 ros2 bag info 输出为对象 */
function parseBagInfo(stdout) {
  const lines = stdout.split('\n')
  const info = { files: [], messages: 0, duration: 0, topics: [] }
  // 简易解析
  const durationMatch = stdout.match(/Duration:\s*([\d.]+)/)
  if (durationMatch) info.duration = parseFloat(durationMatch[1])
  const messagesMatch = stdout.match(/Messages:\s*(\d+)/)
  if (messagesMatch) info.messages = parseInt(messagesMatch[1], 10)
  const topicRegex = /Topic:\s*(\S+)\s*\|.*Type:\s*(\S+)\s*\|.*Count:\s*(\d+)/g
  let m
  while ((m = topicRegex.exec(stdout)) !== null) {
    info.topics.push({ name: m[1], type: m[2], count: parseInt(m[3], 10) })
  }
  return info
}

/** 列出 bag 文件 */
export async function listBags() {
  try { await fs.mkdir(BAG_DIR, { recursive: true }) } catch {}
  const entries = await fs.readdir(BAG_DIR, { withFileTypes: true })
  const bags = []
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const metadataPath = path.join(BAG_DIR, entry.name, 'metadata.yaml')
      let size = 0
      let duration = 0
      try {
        const stat = await fs.stat(path.join(BAG_DIR, entry.name))
        size = stat.size
        const meta = await fs.readFile(metadataPath, 'utf8')
        const dur = meta.match(/duration:\s*\n?\s*nanoseconds:\s*(\d+)/)
        if (dur) duration = parseInt(dur[1], 10) / 1e9
      } catch {}
      bags.push({ name: entry.name, path: path.join(BAG_DIR, entry.name), size, duration })
    }
  }
  return bags
}

/** 获取单个 bag 信息 */
export async function getBagInfo(name) {
  const bagPath = path.join(BAG_DIR, name)
  return new Promise((resolve, reject) => {
    const proc = spawn('ros2', ['bag', 'info', bagPath], { shell: false })
    let stdout = '', stderr = ''
    proc.stdout.on('data', d => stdout += d)
    proc.stderr.on('data', d => stderr += d)
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(stderr || 'ros2 bag info failed'))
      resolve(parseBagInfo(stdout))
    })
  })
}

/** 开始录制 */
export function startRecord(topics = [], options = {}) {
  const id = generateId()
  const outputName = options.name || `bag_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
  const outputDir = path.join(BAG_DIR, outputName)
  const args = ['bag', 'record', '-o', outputDir]
  if (options.all || !topics.length) {
    args.push('-a')
  } else {
    args.push(...topics)
  }
  if (options.compression) args.push('--compression', options.compression)

  const proc = spawn('ros2', args, { shell: false })
  const record = { id, process: proc, topics: options.all ? ['-a'] : topics, startedAt: Date.now(), paused: false, outputDir, outputName }
  activeRecords.set(id, record)

  proc.on('close', () => { activeRecords.delete(id) })
  proc.on('error', () => { activeRecords.delete(id) })

  return { id, outputName, topics: record.topics, startedAt: record.startedAt }
}

/** 暂停/继续录制：ros2 bag record 不支持原生暂停，通过 SIGSTOP/SIGCONT 实现 */
export function pauseRecord(id, pause) {
  const record = activeRecords.get(id)
  if (!record) return false
  if (pause) {
    if (record.paused) return true
    record.process.kill('SIGSTOP')
    record.paused = true
  } else {
    if (!record.paused) return true
    record.process.kill('SIGCONT')
    record.paused = false
  }
  return true
}

/** 停止录制 */
export function stopRecord(id) {
  const record = activeRecords.get(id)
  if (!record) return false
  record.process.kill('SIGINT')
  return true
}

export function listRecords() {
  return Array.from(activeRecords.values()).map(r => ({
    id: r.id, outputName: r.outputName, topics: r.topics, startedAt: r.startedAt, paused: r.paused,
  }))
}

/** 开始回放 */
export function startPlay(bagName, options = {}) {
  const id = generateId()
  const bagPath = path.join(BAG_DIR, bagName)
  const args = ['bag', 'play', bagPath]
  if (options.rate) args.push('-r', String(options.rate))
  if (options.loop) args.push('-l')
  const proc = spawn('ros2', args, { shell: false })
  const play = { id, process: proc, file: bagName, startedAt: Date.now(), paused: false, rate: options.rate || 1 }
  activePlays.set(id, play)
  proc.on('close', () => { activePlays.delete(id) })
  proc.on('error', () => { activePlays.delete(id) })
  return { id, file: bagName, startedAt: play.startedAt, rate: play.rate }
}

export function pausePlay(id, pause) {
  const play = activePlays.get(id)
  if (!play) return false
  if (pause) {
    if (play.paused) return true
    play.process.kill('SIGSTOP')
    play.paused = true
  } else {
    if (!play.paused) return true
    play.process.kill('SIGCONT')
    play.paused = false
  }
  return true
}

export function stopPlay(id) {
  const play = activePlays.get(id)
  if (!play) return false
  play.process.kill('SIGINT')
  return true
}

export function listPlays() {
  return Array.from(activePlays.values()).map(p => ({
    id: p.id, file: p.file, startedAt: p.startedAt, paused: p.paused, rate: p.rate,
  }))
}
