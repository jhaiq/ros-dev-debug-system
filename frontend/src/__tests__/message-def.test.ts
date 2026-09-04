import { describe, it, expect } from 'vitest'
import {
  isBuiltinType,
  parseFieldType,
  buildTypeDefRegistry,
  resolveFieldTree,
  getFieldPaths,
  defaultMessageObject,
  getConstants,
  type RosTypeDef,
} from '../lib/message-def'

// 模拟 rosapi message_details 对 geometry_msgs/Pose 的返回
const POSE_TYPEDEFS: RosTypeDef[] = [
  {
    type: 'geometry_msgs/Pose',
    fieldnames: ['position', 'orientation'],
    fieldtypes: ['geometry_msgs/Point', 'geometry_msgs/Quaternion'],
    fieldarraylen: [-1, -1],
    examples: ['', ''],
    constnames: [], constvalues: [],
  },
  {
    type: 'geometry_msgs/Point',
    fieldnames: ['x', 'y', 'z'],
    fieldtypes: ['float64', 'float64', 'float64'],
    fieldarraylen: [-1, -1, -1],
    examples: ['0', '0', '0'],
    constnames: [], constvalues: [],
  },
  {
    type: 'geometry_msgs/Quaternion',
    fieldnames: ['x', 'y', 'z', 'w'],
    fieldtypes: ['float64', 'float64', 'float64', 'float64'],
    fieldarraylen: [-1, -1, -1, -1],
    examples: ['0', '0', '0', '1'],
    constnames: [], constvalues: [],
  },
]

describe('isBuiltinType', () => {
  it('识别内建类型', () => {
    expect(isBuiltinType('float64')).toBe(true)
    expect(isBuiltinType('string')).toBe(true)
    expect(isBuiltinType('bool')).toBe(true)
    expect(isBuiltinType('time')).toBe(true)
  })
  it('嵌套类型不是内建类型', () => {
    expect(isBuiltinType('geometry_msgs/Point')).toBe(false)
  })
})

describe('parseFieldType', () => {
  it('fieldarraylen=-1 表示非数组', () => {
    expect(parseFieldType('float64', -1)).toEqual({ base: 'float64', isArray: false, arrayLen: 0 })
  })
  it('fieldarraylen=0 表示无界数组', () => {
    expect(parseFieldType('geometry_msgs/Pose', 0)).toEqual({
      base: 'geometry_msgs/Pose', isArray: true, arrayLen: 0,
    })
  })
  it('fieldarraylen>0 表示定长数组', () => {
    expect(parseFieldType('float64', 4)).toEqual({ base: 'float64', isArray: true, arrayLen: 4 })
  })
  it('兼容字符串形式的数组表示', () => {
    expect(parseFieldType('float64[]', -1)).toEqual({ base: 'float64', isArray: true, arrayLen: 0 })
    expect(parseFieldType('float64[3]', -1)).toEqual({ base: 'float64', isArray: true, arrayLen: 3 })
  })
})

describe('resolveFieldTree', () => {
  const registry = buildTypeDefRegistry(POSE_TYPEDEFS)

  it('展开嵌套字段并生成路径', () => {
    const tree = resolveFieldTree('geometry_msgs/Pose', registry)
    expect(tree.map(n => n.name)).toEqual(['position', 'orientation'])
    expect(tree[0].children.map(c => c.path)).toEqual(['position/x', 'position/y', 'position/z'])
    expect(tree[0].children[0].isBuiltin).toBe(true)
  })

  it('数组字段标记 isArray', () => {
    const reg = buildTypeDefRegistry([
      {
        type: 'test/Path', fieldnames: ['poses'], fieldtypes: ['geometry_msgs/Pose'],
        fieldarraylen: [0], examples: [''], constnames: [], constvalues: [],
      },
      ...POSE_TYPEDEFS,
    ])
    const tree = resolveFieldTree('test/Path', reg)
    expect(tree[0].isArray).toBe(true)
    expect(tree[0].arrayLen).toBe(0)
    expect(tree[0].children.length).toBe(2) // position/orientation 递归展开
  })

  it('对循环引用类型有防御', () => {
    const cyc: RosTypeDef[] = [
      { type: 'a/A', fieldnames: ['b'], fieldtypes: ['a/B'], fieldarraylen: [-1], examples: [''], constnames: [], constvalues: [] },
      { type: 'a/B', fieldnames: ['a'], fieldtypes: ['a/A'], fieldarraylen: [-1], examples: [''], constnames: [], constvalues: [] },
    ]
    const reg = buildTypeDefRegistry(cyc)
    const tree = resolveFieldTree('a/A', reg)
    expect(tree[0].children[0].children.length).toBe(0) // seen 拦截
  })

  it('未知类型返回空树', () => {
    expect(resolveFieldTree('no/Such', registry)).toEqual([])
  })
})

describe('getFieldPaths', () => {
  it('只收集内建叶子路径', () => {
    const tree = resolveFieldTree('geometry_msgs/Pose', buildTypeDefRegistry(POSE_TYPEDEFS))
    const paths = getFieldPaths(tree)
    expect(paths.map(p => p.path)).toEqual([
      'position/x', 'position/y', 'position/z',
      'orientation/x', 'orientation/y', 'orientation/z', 'orientation/w',
    ])
  })
})

describe('defaultMessageObject', () => {
  it('按定义生成默认值', () => {
    const tree = resolveFieldTree('geometry_msgs/Pose', buildTypeDefRegistry(POSE_TYPEDEFS))
    const msg = defaultMessageObject(tree)
    expect(msg).toEqual({
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 0 },
    })
  })

  it('内建标量与数组默认值', () => {
    const reg = buildTypeDefRegistry([
      {
        type: 't/M', fieldnames: ['on', 'name', 'ids', 'stamp'],
        fieldtypes: ['bool', 'string', 'int32', 'time'],
        fieldarraylen: [-1, -1, 0, -1],
        examples: ['false', 'hello', '', ''],
        constnames: [], constvalues: [],
      },
    ])
    const msg = defaultMessageObject(resolveFieldTree('t/M', reg))
    expect(msg).toEqual({ on: false, name: '', ids: [], stamp: { sec: 0, nanosec: 0 } })
  })
})

describe('getConstants', () => {
  it('提取常量定义', () => {
    const td: RosTypeDef = {
      type: 'std_msgs/Header',
      fieldnames: [], fieldtypes: [], fieldarraylen: [],
      examples: [], constnames: ['DEBUG', 'INFO'], constvalues: ['10', '20'],
    }
    expect(getConstants(td)).toEqual([
      { name: 'DEBUG', value: '10' },
      { name: 'INFO', value: '20' },
    ])
  })
})
