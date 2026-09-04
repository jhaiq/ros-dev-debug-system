/**
 * rqt 复刻基础设施 — 消息定义（rosapi TypeDef）解析器
 *
 * rosapi 的 /rosapi/message_details、/rosapi/service_request_details、
 * /rosapi/service_response_details、/rosapi/action_goal_details 等服务
 * 均返回 rosapi_msgs/srv/MessageDetails 的 typedefs 字段（TypeDef[]）：
 *
 *   TypeDef {
 *     type: string            // 本类型的完整名（typedefs[0] 为根类型）
 *     fieldnames: string[]    // 字段名
 *     fieldtypes: string[]    // 字段类型（builtin 或嵌套类型完整名）
 *     fieldarraylen: number[] // -1 非数组；0 无界数组；>0 定长数组
 *     examples: string[]
 *     constnames: string[] / constvalues: string[]
 *   }
 */

export interface RosTypeDef {
  type: string
  fieldnames: string[]
  fieldtypes: string[]
  fieldarraylen: number[]
  examples: string[]
  constnames: string[]
  constvalues: string[]
}

export interface FieldNode {
  /** 字段名（根层级的树中即字段名，不包含前缀） */
  name: string
  /** 去掉数组部分后的字段类型（builtin 或嵌套类型完整名） */
  type: string
  isArray: boolean
  arrayLen: number // 0 = 无界
  isBuiltin: boolean
  /** 嵌套消息字段（仅非 builtin 时存在） */
  children: FieldNode[]
  /** rosapi 给出的示例值字符串（可能为空） */
  example: string
  /** 展开路径，如 "pose/orientation/x"；根层级字段为 "pose" */
  path: string
}

export interface ConstantInfo {
  name: string
  value: string
}

/** ROS 2 内建字段类型（IDL primitive） */
const BUILTIN_TYPES = new Set([
  'bool', 'byte', 'char',
  'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64',
  'float32', 'float64', 'float128',
  'string', 'wstring',
  'time', 'duration',
])

export function isBuiltinType(type: string): boolean {
  return BUILTIN_TYPES.has(type)
}

/** 解析一个字段类型 + arraylen 为 (基类型, 是否数组, 定长) */
export function parseFieldType(fieldtype: string, arraylen: number): {
  base: string; isArray: boolean; arrayLen: number
} {
  // 兼容直接写 "type[]" / "type[N]" 的字符串表示
  const m = fieldtype.match(/^(.*?)\[(\d*)\]$/)
  if (m) {
    return { base: m[1], isArray: true, arrayLen: m[2] ? parseInt(m[2], 10) : 0 }
  }
  if (arraylen === -1) return { base: fieldtype, isArray: false, arrayLen: 0 }
  return { base: fieldtype, isArray: true, arrayLen: arraylen }
}

/**
 * 由 rosapi 返回的 typedefs 列表构建类型注册表。
 * typedefs[0] 是请求的根类型；后续条目是各嵌套类型的定义。
 */
export function buildTypeDefRegistry(typedefs: RosTypeDef[]): Map<string, RosTypeDef> {
  const registry = new Map<string, RosTypeDef>()
  typedefs.forEach(td => registry.set(td.type, td))
  return registry
}

function normalizeExample(examples: string[], i: number): string {
  return examples && examples[i] !== undefined ? examples[i] : ''
}

/** 递归展开字段树；maxDepth 防御循环引用/超深嵌套 */
export function resolveFieldTree(
  rootType: string,
  registry: Map<string, RosTypeDef>,
  maxDepth = 16,
): FieldNode[] {
  const root = registry.get(rootType)
  if (!root) return []

  const expand = (
    td: RosTypeDef,
    parentPath: string,
    depth: number,
    seen: Set<string>,
  ): FieldNode[] => {
    if (depth > maxDepth) return []
    const nodes: FieldNode[] = []
    for (let i = 0; i < td.fieldnames.length; i++) {
      const name = td.fieldnames[i]
      const { base, isArray, arrayLen } = parseFieldType(td.fieldtypes[i] || '', td.fieldarraylen?.[i] ?? -1)
      const path = parentPath ? `${parentPath}/${name}` : name
      const isBuiltin = isBuiltinType(base)
      let children: FieldNode[] = []
      if (!isBuiltin && !seen.has(base)) {
        const nested = registry.get(base)
        if (nested) {
          children = expand(nested, path, depth + 1, new Set([...seen, base]))
        }
      }
      nodes.push({
        name, type: base, isArray, arrayLen, isBuiltin, children,
        example: normalizeExample(td.examples, i), path,
      })
    }
    return nodes
  }

  return expand(root, '', 0, new Set([rootType]))
}

/** 收集叶子字段路径（rqt_plot 表达式用） */
export function getFieldPaths(
  tree: FieldNode[],
  filterBuiltinOnly = true,
): FieldNode[] {
  const out: FieldNode[] = []
  const walk = (nodes: FieldNode[]) => {
    nodes.forEach(n => {
      if (n.children.length > 0) walk(n.children)
      else if (!filterBuiltinOnly || n.isBuiltin) out.push(n)
    })
  }
  walk(tree)
  return out
}

const ZERO_VALUES: Record<string, any> = {
  bool: false,
  byte: 0, char: 0,
  int8: 0, uint8: 0, int16: 0, uint16: 0, int32: 0, uint32: 0, int64: 0, uint64: 0,
  float32: 0, float64: 0, float128: 0,
  string: '', wstring: '',
  time: { sec: 0, nanosec: 0 },
  duration: { sec: 0, nanosec: 0 },
}

/**
 * 由字段树生成默认消息对象（rqt_publisher 的"按定义生成默认值"行为）。
 * - builtin：0 / false / ''（time/duration 给 {sec,nanosec}）
 * - 数组：空数组
 * - 嵌套：递归展开
 */
export function defaultMessageObject(tree: FieldNode[]): Record<string, any> {
  const obj: Record<string, any> = {}
  tree.forEach(node => {
    if (!node.isBuiltin) {
      obj[node.name] = node.isArray ? [] : defaultMessageObject(node.children)
    } else if (node.isArray) {
      obj[node.name] = []
    } else {
      const zero = ZERO_VALUES[node.type]
      obj[node.name] = zero !== undefined ? zero : 0
    }
  })
  return obj
}

export interface MessageConstants {
  type: string
  constants: ConstantInfo[]
}

/** 提取某类型的常量定义 */
export function getConstants(td: RosTypeDef): ConstantInfo[] {
  return (td.constnames || []).map((name, i) => ({ name, value: td.constvalues?.[i] ?? '' }))
}
