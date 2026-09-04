/**
 * rqt_publisher / rqt_service_caller 复刻共用组件 —
 * 按消息定义生成的嵌套字段编辑器
 */
import { defaultMessageObject, type FieldNode } from '../lib/message-def'

interface Props {
  tree: FieldNode[]
  value: Record<string, any>
  onChange: (v: Record<string, any>) => void
  depth?: number
}

function BuiltinInput({ node, val, onChange }: { node: FieldNode; val: any; onChange: (v: any) => void }) {
  switch (node.type) {
    case 'bool':
      return (
        <label className="inline-flex items-center gap-1 text-sm">
          <input type="checkbox" checked={!!val} onChange={e => onChange(e.target.checked)} />
          <span className="text-gray-400">{val ? 'true' : 'false'}</span>
        </label>
      )
    case 'time':
    case 'duration':
      return (
        <div className="flex gap-2 text-sm">
          <input type="number" className="w-28 px-2 py-1 border rounded" value={val?.sec ?? 0}
            onChange={e => onChange({ ...val, sec: Number(e.target.value) })} placeholder="sec" />
          <input type="number" className="w-28 px-2 py-1 border rounded" value={val?.nanosec ?? 0}
            onChange={e => onChange({ ...val, nanosec: Number(e.target.value) })} placeholder="nanosec" />
        </div>
      )
    case 'string':
    case 'wstring':
    case 'char':
      return (
        <input type="text" className="w-56 px-2 py-1 border rounded text-sm font-mono" value={val ?? ''}
          onChange={e => onChange(e.target.value)} />
      )
    default:
      return (
        <input type="number" step="any" className="w-32 px-2 py-1 border rounded text-sm" value={val ?? 0}
          onChange={e => onChange(Number(e.target.value))} />
      )
  }
}

export default function MessageFieldEditor({ tree, value, onChange, depth = 0 }: Props) {
  return (
    <div className={depth > 0 ? 'ml-4 border-l pl-3 space-y-2' : 'space-y-2'}>
      {tree.map(node => {
        const val = value?.[node.name]
        const set = (v: any) => onChange({ ...value, [node.name]: v })

        if (node.isArray) {
          const arr: any[] = Array.isArray(val) ? val : []
          return (
            <div key={node.path} className="py-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium font-mono">{node.name}</span>
                <span className="text-xs text-gray-400">{node.type}[{node.arrayLen || ''}]</span>
                {node.arrayLen === 0 && arr.length === 0 && (
                  <button
                    onClick={() => set([node.isBuiltin ? 0 : defaultMessageObject(node.children)])}
                    className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 rounded">
                    + 添加元素
                  </button>
                )}
              </div>
              {arr.length > 0 && (
                <div className="mt-1 space-y-1">
                  {arr.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-xs text-gray-400 w-8 pt-1.5">[{i}]</span>
                      <div className="flex-1">
                        {node.isBuiltin ? (
                          <BuiltinInput node={{ ...node, isArray: false }} val={item}
                            onChange={v => { const n = [...arr]; n[i] = v; set(n) }} />
                        ) : (
                          <MessageFieldEditor tree={node.children} value={item || {}}
                            onChange={v => { const n = [...arr]; n[i] = v; set(n) }} depth={depth + 1} />
                        )}
                      </div>
                      {node.arrayLen === 0 && (
                        <button onClick={() => set(arr.filter((_, j) => j !== i))}
                          className="text-xs text-red-500 hover:text-red-700 px-1">删除</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {node.arrayLen > 0 && arr.length < node.arrayLen && (
                <div className="text-xs text-amber-500 mt-1">
                  定长数组需 {node.arrayLen} 个元素，当前 {arr.length}
                </div>
              )}
            </div>
          )
        }

        if (!node.isBuiltin) {
          return (
            <fieldset key={node.path} className="py-1">
              <legend className="text-sm font-medium font-mono px-1">
                {node.name} <span className="text-xs text-gray-400 font-normal">{node.type}</span>
              </legend>
              <MessageFieldEditor tree={node.children} value={val || {}} onChange={set} depth={depth + 1} />
            </fieldset>
          )
        }

        return (
          <div key={node.path} className="flex items-center gap-3 py-0.5">
            <span className="text-sm font-mono w-40 shrink-0">{node.name}</span>
            <span className="text-xs text-gray-400 w-16 shrink-0">{node.type}</span>
            <BuiltinInput node={node} val={val} onChange={set} />
            {node.example && (
              <span className="text-xs text-gray-300 truncate max-w-24">例: {node.example}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
