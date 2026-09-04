/**
 * rqt_gui 复刻 — 工作台（可停靠窗口 + 透视）
 * 使用 react-mosaic 实现拖拽分割布局；透视 = 布局树，支持保存/切换/导入导出。
 */
import { useState, useCallback, useRef } from 'react'
import { Mosaic, MosaicNode, getLeaves } from 'react-mosaic-component'
import 'react-mosaic-component/react-mosaic-component.css'
import { PLUGINS, getPlugin } from '../workspace/plugins'

const LAYOUT_KEY = 'rqt_workspace_layout'
const PERSPECTIVES_KEY = 'rqt_workspace_perspectives'

interface Perspective {
  name: string
  layout: MosaicNode<string> | null
}

function loadLayout(): MosaicNode<string> | null {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

function loadPerspectives(): Perspective[] {
  try {
    const raw = localStorage.getItem(PERSPECTIVES_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

function saveLayout(layout: MosaicNode<string> | null) {
  try {
    if (layout) localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
    else localStorage.removeItem(LAYOUT_KEY)
  } catch {}
}

function savePerspectives(list: Perspective[]) {
  try { localStorage.setItem(PERSPECTIVES_KEY, JSON.stringify(list)) } catch {}
}

/** 把新插件追加到布局（v7 N 叉树）：null → 叶子；叶子 → 包一层 split；split → 追加 child；tabs → 追加标签 */
function appendPlugin(layout: MosaicNode<string> | null, pluginId: string): MosaicNode<string> {
  if (!layout) return pluginId
  if (typeof layout === 'string') {
    return {
      type: 'split', direction: 'column',
      children: [layout, pluginId], splitPercentages: [60, 40],
    }
  }
  if (layout.type === 'split') {
    const count = layout.children.length + 1
    // 平均分配百分比
    const splitPercentages = Array.from({ length: count }, () => Math.floor(100 / count))
    splitPercentages[count - 1] = 100 - splitPercentages.slice(0, -1).reduce((a, b) => a + b, 0)
    return { ...layout, children: [...layout.children, pluginId], splitPercentages }
  }
  // tabs
  return { ...layout, tabs: [...layout.tabs, pluginId], activeTabIndex: layout.tabs.length }
}

export default function WorkspacePage() {
  const [layout, setLayout] = useState<MosaicNode<string> | null>(() => loadLayout())
  const [perspectives, setPerspectives] = useState<Perspective[]>(() => loadPerspectives())
  const [activePerspective, setActivePerspective] = useState<string | null>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [perspMenuOpen, setPerspMenuOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const onChange = useCallback((node: MosaicNode<string> | null) => {
    setLayout(node)
    saveLayout(node)
  }, [])

  const leaves = layout ? getLeaves(layout) : []

  const addPlugin = (pluginId: string) => {
    if (leaves.includes(pluginId)) { setAddMenuOpen(false); return }
    const next = appendPlugin(layout, pluginId)
    setLayout(next)
    saveLayout(next)
    setAddMenuOpen(false)
  }

  const savePerspective = () => {
    const name = prompt('透视名称：', activePerspective || `透视 ${perspectives.length + 1}`)
    if (!name) return
    const next = [...perspectives.filter(p => p.name !== name), { name, layout }]
    setPerspectives(next)
    savePerspectives(next)
    setActivePerspective(name)
  }

  const loadPerspective = (name: string) => {
    const p = perspectives.find(x => x.name === name)
    if (!p) return
    setLayout(p.layout)
    saveLayout(p.layout)
    setActivePerspective(name)
    setPerspMenuOpen(false)
  }

  const deletePerspective = (name: string) => {
    const next = perspectives.filter(p => p.name !== name)
    setPerspectives(next)
    savePerspectives(next)
    if (activePerspective === name) setActivePerspective(null)
    setPerspMenuOpen(false)
  }

  const exportPerspective = () => {
    const blob = new Blob([JSON.stringify({ perspective: activePerspective, layout }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `perspective-${activePerspective || 'default'}-${new Date().toISOString().slice(0, 19)}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  const importPerspective = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string)
        if (data.layout) {
          setLayout(data.layout)
          saveLayout(data.layout)
          if (data.perspective) setActivePerspective(data.perspective)
          alert('透视已导入')
        }
      } catch { alert('导入失败：JSON 格式错误') }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const renderTile = useCallback((id: string) => {
    const plugin = getPlugin(id)
    if (!plugin) return <div className="p-4 text-sm text-gray-400">未知插件: {id}</div>
    const Component = plugin.component
    return <Component />
  }, [])

  const renderTabTitle = useCallback((props: { tabKey: string }) => {
    return <span className="text-sm">{getPlugin(props.tabKey)?.title || props.tabKey}</span>
  }, [])

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b flex-wrap">
        <h1 className="text-lg font-bold">🧩 工作台</h1>

        <div className="relative">
          <button onClick={() => { setAddMenuOpen(o => !o); setPerspMenuOpen(false) }}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">+ 添加插件</button>
          {addMenuOpen && (
            <div className="absolute z-20 mt-1 w-48 bg-white border rounded shadow-lg max-h-72 overflow-y-auto">
              {PLUGINS.map(p => (
                <button key={p.id} onClick={() => addPlugin(p.id)} disabled={leaves.includes(p.id)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed">
                  {p.title} {leaves.includes(p.id) && <span className="text-xs text-gray-300">(已添加)</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button onClick={() => { setPerspMenuOpen(o => !o); setAddMenuOpen(false) }}
            className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300">
            透视：{activePerspective || '（未保存）'} ▾
          </button>
          {perspMenuOpen && (
            <div className="absolute z-20 mt-1 w-56 bg-white border rounded shadow-lg max-h-72 overflow-y-auto">
              {perspectives.map(p => (
                <div key={p.name} className="flex items-center px-3 py-2 text-sm hover:bg-gray-50">
                  <button className="flex-1 text-left" onClick={() => loadPerspective(p.name)}>{p.name}</button>
                  <button className="text-xs text-red-500 hover:underline" onClick={() => deletePerspective(p.name)}>删除</button>
                </div>
              ))}
              {perspectives.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">暂无保存的透视</div>}
              <div className="border-t px-3 py-2">
                <button onClick={savePerspective} className="w-full text-left text-sm text-blue-600 hover:underline">保存当前布局为透视…</button>
              </div>
            </div>
          )}
        </div>

        <button onClick={exportPerspective} className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300">导出</button>
        <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300">导入</button>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={importPerspective} />
        <button onClick={() => { setLayout(null); saveLayout(null); setActivePerspective(null) }}
          className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200">清空布局</button>

        <span className="ml-auto text-xs text-gray-400">{leaves.length} 个面板 — 拖动标签栏可重新排布，拖动分割线调整大小</span>
      </div>

      {/* Mosaic 布局 */}
      <div className="flex-1 min-h-0">
        <Mosaic<string>
          value={layout}
          onChange={onChange}
          renderTile={renderTile}
          renderTabTitle={renderTabTitle}
          className="mosaic-blueprint-theme"
          zeroStateView={
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
              <div className="text-4xl">🧩</div>
              <div className="text-sm">点击上方"添加插件"构建你的工作台</div>
            </div>
          }
        />
      </div>
    </div>
  )
}
