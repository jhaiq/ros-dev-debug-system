/**
 * rqt_console 复刻增强 — /rosout 日志控制台
 * 支持 rqt_console 级别的过滤/高亮/暂停/列配置/缓冲区大小/导出。
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import { useROS } from '../hooks/useROS'
import ROSLIB from 'roslib'

type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'FATAL'

interface LogEntry {
  level: LogLevel
  message: string
  time: Date
  node: string
  topic: string
  file: string
  function: string
  line: number
  raw: any
}

const LEVELS: LogLevel[] = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'FATAL']
const LEVEL_NUM: Record<number, LogLevel> = { 1: 'DEBUG', 2: 'INFO', 4: 'WARNING', 8: 'ERROR', 16: 'FATAL' }
const LEVEL_BADGE: Record<LogLevel, string> = {
  DEBUG: 'bg-gray-100 text-gray-700',
  INFO: 'bg-blue-100 text-blue-700',
  WARNING: 'bg-amber-100 text-amber-800',
  ERROR: 'bg-red-100 text-red-800',
  FATAL: 'bg-purple-100 text-purple-800',
}

interface HighlightRule {
  id: string
  text: string
  regex: boolean
  color: string
}

interface Filters {
  includeText: string
  excludeText: string
  nodes: string
  topics: string
  regex: boolean
  level: LogLevel | 'ALL'
}

export default function LogsPage() {
  const { ros, connected } = useROS()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [paused, setPaused] = useState(false)
  const [bufferSize, setBufferSize] = useState(500)
  const [showCols, setShowCols] = useState({ node: true, topic: true, file: false })
  const [filters, setFilters] = useState<Filters>({
    includeText: '', excludeText: '', nodes: '', topics: '', regex: false, level: 'ALL',
  })
  const [highlights, setHighlights] = useState<HighlightRule[]>([])
  const [hlText, setHlText] = useState('')
  const [hlColor, setHlColor] = useState('#f59e0b')
  const [hlRegex, setHlRegex] = useState(false)
  const [liveMode, setLiveMode] = useState(true)
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ros || !connected) return
    const topic = new ROSLIB.Topic({ ros, name: '/rosout', messageType: 'rosgraph_msgs/msg/Log' })
    topic.subscribe((msg: any) => {
      if (paused) return
      const stamp = msg.header?.stamp
      const time = stamp ? new Date((stamp.sec || stamp.secs || 0) * 1000 + (stamp.nanosec || 0) / 1e6) : new Date()
      const entry: LogEntry = {
        level: LEVEL_NUM[msg.level] || 'INFO',
        message: msg.msg || '',
        time,
        node: msg.name || '',
        topic: msg.topic || '',
        file: msg.file || '',
        function: msg.function || '',
        line: msg.line || 0,
        raw: msg,
      }
      setLogs(prev => [...prev.slice(-bufferSize + 1), entry])
    })
    return () => { try { topic.unsubscribe() } catch {} }
  }, [ros, connected, paused, bufferSize])

  useEffect(() => {
    if (liveMode && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, liveMode])

  const parseFilter = (v: string, regex: boolean): { re?: RegExp; raw?: string } => {
    const trimmed = v.trim()
    if (!trimmed) return {}
    if (regex) {
      try { return { re: new RegExp(trimmed, 'i') } } catch { return { raw: trimmed } }
    }
    return { raw: trimmed.toLowerCase() }
  }

  const filteredLogs = useMemo(() => {
    const inc = parseFilter(filters.includeText, filters.regex)
    const exc = parseFilter(filters.excludeText, filters.regex)
    const nodeSet = new Set(filters.nodes.split(/[,\s]+/).filter(Boolean).map(s => s.toLowerCase()))
    const topicSet = new Set(filters.topics.split(/[,\s]+/).filter(Boolean).map(s => s.toLowerCase()))
    return logs.filter(log => {
      if (filters.level !== 'ALL' && log.level !== filters.level) return false
      const msg = log.message
      if (inc.re && !inc.re.test(msg)) return false
      if (inc.raw && !msg.toLowerCase().includes(inc.raw)) return false
      if (exc.re && exc.re.test(msg)) return false
      if (exc.raw && msg.toLowerCase().includes(exc.raw)) return false
      if (nodeSet.size > 0 && !nodeSet.has(log.node.toLowerCase())) return false
      if (topicSet.size > 0 && !topicSet.has(log.topic.toLowerCase())) return false
      return true
    })
  }, [logs, filters])

  const addHighlight = () => {
    if (!hlText.trim()) return
    setHighlights(prev => [...prev, { id: Math.random().toString(36).slice(2), text: hlText.trim(), regex: hlRegex, color: hlColor }])
    setHlText('')
  }

  const removeHighlight = (id: string) => setHighlights(prev => prev.filter(h => h.id !== id))

  const applyHighlights = (text: string): JSX.Element => {
    if (!highlights.length) return <span className="break-all">{text}</span>
    const parts: { text: string; color?: string }[] = [{ text }]
    highlights.forEach(h => {
      const next: { text: string; color?: string }[] = []
      parts.forEach(p => {
        if (p.color) { next.push(p); return }
        const re = h.regex ? (() => { try { return new RegExp(`(${h.text})`, 'g') } catch { return null } })() : new RegExp(`(${h.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'g')
        if (!re) { next.push(p); return }
        const pieces = p.text.split(re)
        for (let i = 0; i < pieces.length; i++) {
          next.push({ text: pieces[i], color: i % 2 === 1 ? h.color : undefined })
        }
      })
      parts.length = 0; parts.push(...next)
    })
    return <span className="break-all">{parts.map((p, i) => p.color ? <mark key={i} style={{ backgroundColor: p.color }} className="rounded px-0.5">{p.text}</mark> : <span key={i}>{p.text}</span>)}</span>
  }

  const exportTxt = () => download(filteredLogs.map(l => `[${fmtTime(l.time)}] [${l.level}] ${l.node} ${l.topic} ${l.message}`).join('\n'), `ros-logs-${iso()}.txt`, 'text/plain')
  const exportCsv = () => {
    const rows = filteredLogs.map(l => `"${fmtTime(l.time)}","${l.level}","${l.node}","${l.topic}","${l.message.replace(/"/g, '""')}"`)
    download('Time,Level,Node,Topic,Message\n' + rows.join('\n'), `ros-logs-${iso()}.csv`, 'text/csv')
  }

  const clear = () => setLogs([])

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">日志系统</h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setPaused(p => !p)} className={`px-4 py-2 rounded text-white ${paused ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {paused ? '继续' : '暂停'}
          </button>
          <button onClick={exportTxt} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">导出 TXT</button>
          <button onClick={exportCsv} className="px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800">导出 CSV</button>
          <button onClick={clear} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">清空</button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          {LEVELS.map(l => (
            <button key={l} onClick={() => setFilters(f => ({ ...f, level: f.level === l ? 'ALL' : l }))}
              className={`px-3 py-1 rounded text-sm ${filters.level === l ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
              {l}
            </button>
          ))}
          <label className="flex items-center gap-1 text-sm ml-auto">
            <input type="checkbox" checked={liveMode} onChange={e => setLiveMode(e.target.checked)} />
            自动滚动
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <input value={filters.includeText} onChange={e => setFilters(f => ({ ...f, includeText: e.target.value }))}
            placeholder="消息包含…" className="px-3 py-2 border rounded text-sm" />
          <input value={filters.excludeText} onChange={e => setFilters(f => ({ ...f, excludeText: e.target.value }))}
            placeholder="消息不包含…" className="px-3 py-2 border rounded text-sm" />
          <input value={filters.nodes} onChange={e => setFilters(f => ({ ...f, nodes: e.target.value }))}
            placeholder="节点过滤（逗号分隔）" className="px-3 py-2 border rounded text-sm font-mono" />
          <input value={filters.topics} onChange={e => setFilters(f => ({ ...f, topics: e.target.value }))}
            placeholder="话题过滤（逗号分隔）" className="px-3 py-2 border rounded text-sm font-mono" />
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={filters.regex} onChange={e => setFilters(f => ({ ...f, regex: e.target.checked }))} />
            正则
          </label>
          <label className="flex items-center gap-1">缓冲区
            <select value={bufferSize} onChange={e => setBufferSize(Number(e.target.value))} className="border rounded px-2 py-1">
              {[100, 500, 1000, 5000].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={showCols.node} onChange={e => setShowCols(c => ({ ...c, node: e.target.checked }))} />节点</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={showCols.topic} onChange={e => setShowCols(c => ({ ...c, topic: e.target.checked }))} />话题</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={showCols.file} onChange={e => setShowCols(c => ({ ...c, file: e.target.checked }))} />文件</label>
          <span className="ml-auto text-gray-500">{filteredLogs.length} / {logs.length}</span>
        </div>

        <div className="border-t pt-3">
          <div className="text-xs text-gray-500 mb-1">高亮规则</div>
          <div className="flex gap-2 flex-wrap items-center mb-2">
            <input value={hlText} onChange={e => setHlText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addHighlight()}
              placeholder="高亮文本" className="px-3 py-1 border rounded text-sm" />
            <input type="color" value={hlColor} onChange={e => setHlColor(e.target.value)} className="h-8 w-10" />
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={hlRegex} onChange={e => setHlRegex(e.target.checked)} />正则</label>
            <button onClick={addHighlight} className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">添加</button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {highlights.map(h => (
              <span key={h.id} className="text-xs px-2 py-1 rounded flex items-center gap-1 border" style={{ backgroundColor: h.color, color: '#fff' }}>
                {h.regex ? `/${h.text}/` : h.text}
                <button onClick={() => removeHighlight(h.id)} className="ml-1 hover:opacity-80">×</button>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="grid grid-cols-12 gap-2 p-3 border-b bg-gray-50 font-mono text-xs font-semibold">
          <div className="col-span-2">时间</div>
          <div className="col-span-1">级别</div>
          {showCols.node && <div className="col-span-2">节点</div>}
          {showCols.topic && <div className="col-span-2">话题</div>}
          {showCols.file && <div className="col-span-2">文件:行</div>}
          <div className={messageColSpan(showCols)}>消息</div>
        </div>
        <div className="max-h-[560px] overflow-y-auto font-mono text-sm">
          {filteredLogs.map((log, i) => (
            <div key={i} className={`grid grid-cols-12 gap-2 p-2 border-b hover:bg-gray-50 ${LEVEL_BADGE[log.level]}`}>
              <div className="col-span-2 text-gray-600">{fmtTime(log.time)}</div>
              <div className="col-span-1 font-bold">{log.level[0]}</div>
              {showCols.node && <div className="col-span-2 truncate" title={log.node}>{log.node}</div>}
              {showCols.topic && <div className="col-span-2 truncate" title={log.topic}>{log.topic}</div>}
              {showCols.file && <div className="col-span-2 truncate" title={`${log.file}:${log.line}`}>{log.file.split('/').pop()}:{log.line}</div>}
              <div className={messageColSpan(showCols)}>{applyHighlights(log.message)}</div>
            </div>
          ))}
          {filteredLogs.length === 0 && <div className="text-gray-400 text-center py-8">暂无日志</div>}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  )
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString() + '.' + String(d.getMilliseconds()).padStart(3, '0')
}
function iso() { return new Date().toISOString().slice(0, 19) }
function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url)
}
function messageColSpan(cols: { node: boolean; topic: boolean; file: boolean }): string {
  const map: Record<string, string> = {
    'false,false,false': 'col-span-9',
    'true,false,false': 'col-span-7',
    'false,true,false': 'col-span-7',
    'false,false,true': 'col-span-7',
    'true,true,false': 'col-span-5',
    'true,false,true': 'col-span-5',
    'false,true,true': 'col-span-5',
    'true,true,true': 'col-span-3',
  }
  return map[`${cols.node},${cols.topic},${cols.file}`] || 'col-span-9'
}
