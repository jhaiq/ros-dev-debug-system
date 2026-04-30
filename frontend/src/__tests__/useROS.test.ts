// @ts-nocheck
/**
 * useROS Hook 测试
 * 覆盖: 初始状态 / 连接成功 / 连接失败 / 断开连接 / URL 管理 / localStorage 持久化
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useROS } from '../hooks/useROS'

// ─── ROSLIB Mock ───────────────────────────────────────

// Track instances at module level
interface MockRosInstance {
  on: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

declare global {
  // eslint-disable-next-line no-var
  var __mockRosInstances: MockRosInstance[]
}
globalThis.__mockRosInstances = []

vi.mock('roslib', () => {
  return {
    default: {
      Ros: class {
        on: ReturnType<typeof vi.fn>
        close: ReturnType<typeof vi.fn>

        constructor(_options: { url: string }) {
          this.on = vi.fn()
          this.close = vi.fn()
          globalThis.__mockRosInstances.push(this as MockRosInstance)
        }
      },
    },
  }
})

// Mock localStorage
const mockLocalStorage: Record<string, string> = {}
const mockStorage = {
  getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
  setItem: vi.fn((key: string, value: string) => { mockLocalStorage[key] = value }),
  removeItem: vi.fn((key: string) => { delete mockLocalStorage[key] }),
  clear: vi.fn(() => { Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]) }),
}

beforeEach(() => {
  Object.defineProperty(global, 'localStorage', {
    value: mockStorage,
    writable: true,
    configurable: true,
  })
  globalThis.__mockRosInstances = []
  mockLocalStorage['rosbridge_url'] = ''
  vi.clearAllMocks()
})

vi.useFakeTimers()

const getInstances = () => globalThis.__mockRosInstances as MockRosInstance[]

describe('useROS', () => {
  it('初始状态: connected = false, error = null', () => {
    const { result } = renderHook(() => useROS())
    expect(result.current.connected).toBe(false)
    expect(result.current.error).toBe(null)
  })

  it('默认 URL 为 ws://localhost:9090', () => {
    const { result } = renderHook(() => useROS())
    expect(result.current.url).toBe('ws://localhost:9090')
  })

  it('使用自定义 initialUrl', () => {
    const { result } = renderHook(() => useROS('ws://custom:9090'))
    expect(result.current.url).toBe('ws://custom:9090')
  })

  it('从 localStorage 恢复 URL', () => {
    mockLocalStorage['rosbridge_url'] = 'ws://saved:9090'
    const { result } = renderHook(() => useROS())
    expect(result.current.url).toBe('ws://saved:9090')
  })

  it('创建 ROSLIB.Ros 实例', () => {
    const { result } = renderHook(() => useROS())
    expect(result.current.ros).not.toBeNull()
  })

  it('连接成功后更新状态', () => {
    const { result } = renderHook(() => useROS())
    const rosInstance = getInstances()[0]
    const connectionHandler = rosInstance.on.mock.calls.find(
      (call) => call[0] === 'connection'
    )
    act(() => {
      connectionHandler[1]()
    })
    expect(result.current.connected).toBe(true)
    expect(result.current.error).toBe(null)
  })

  it('连接失败后更新状态', () => {
    const { result } = renderHook(() => useROS())
    const rosInstance = getInstances()[0]
    const errorHandler = rosInstance.on.mock.calls.find(
      (call) => call[0] === 'error'
    )
    act(() => {
      errorHandler[1]('Connection refused')
    })
    expect(result.current.connected).toBe(false)
    expect(result.current.error).toBe('Connection refused')
  })

  it('断开连接后更新状态', () => {
    const { result } = renderHook(() => useROS())
    const rosInstance = getInstances()[0]
    const connectionHandler = rosInstance.on.mock.calls.find(
      (call) => call[0] === 'connection'
    )
    act(() => {
      connectionHandler[1]()
    })
    expect(result.current.connected).toBe(true)
    const closeHandler = rosInstance.on.mock.calls.find(
      (call) => call[0] === 'close'
    )
    act(() => {
      closeHandler[1]()
    })
    expect(result.current.connected).toBe(false)
  })

  it('调用 disconnect 后停止自动重连', () => {
    const { result } = renderHook(() => useROS())
    act(() => {
      result.current.disconnect()
    })
    expect(result.current.connected).toBe(false)
    expect(result.current.ros).toBe(null)
    const rosInstance = getInstances()[0]
    const closeHandler = rosInstance.on.mock.calls.find(
      (call) => call[0] === 'close'
    )
    act(() => {
      closeHandler[1]()
    })
    // 不应创建新的 ROS 实例
    expect(getInstances().length).toBe(1)
  })

  it('连接失败后重连延迟指数增长', () => {
    renderHook(() => useROS())
    // 第一次 close 触发重连（延迟 3000ms）
    const rosInstance1 = getInstances()[0]
    const closeHandler1 = rosInstance1.on.mock.calls.find(
      (call) => call[0] === 'close'
    )
    act(() => {
      closeHandler1[1]()
    })
    // 快进 2999ms，不应重连
    act(() => { vi.advanceTimersByTime(2999) })
    expect(getInstances().length).toBe(1)
    // 再快进 1ms（总计 3000），应触发重连
    act(() => { vi.advanceTimersByTime(1) })
    expect(getInstances().length).toBe(2)
    // 第二次 close 触发重连（延迟 6000ms）
    const rosInstance2 = getInstances()[1]
    const closeHandler2 = rosInstance2.on.mock.calls.find(
      (call) => call[0] === 'close'
    )
    act(() => {
      closeHandler2[1]()
    })
    // 快进 5999ms，不应重连
    act(() => { vi.advanceTimersByTime(5999) })
    expect(getInstances().length).toBe(2)
    // 再快进 1ms（总计 6000），应触发重连
    act(() => { vi.advanceTimersByTime(1) })
    expect(getInstances().length).toBe(3)
  })

  it('连接成功后重置重连计数器', () => {
    const { result } = renderHook(() => useROS())
    // 第一次 close → 重连延迟 3000ms
    const closeHandler1 = getInstances()[0].on.mock.calls.find(
      (call) => call[0] === 'close'
    )
    act(() => { closeHandler1[1]() })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(getInstances().length).toBe(2)
    // 连接成功
    const connectHandler = getInstances()[1].on.mock.calls.find(
      (call) => call[0] === 'connection'
    )
    act(() => { connectHandler[1]() })
    expect(result.current.connected).toBe(true)
    // 再次 close → 应重置为 3000ms（而非 6000）
    const closeHandler2 = getInstances()[1].on.mock.calls.find(
      (call) => call[0] === 'close'
    )
    act(() => { closeHandler2[1]() })
    act(() => { vi.advanceTimersByTime(2999) })
    expect(getInstances().length).toBe(2)
    act(() => { vi.advanceTimersByTime(1) })
    expect(getInstances().length).toBe(3)
  })

  it('调用 connect 可以切换到新 URL', () => {
    const { result } = renderHook(() => useROS())
    act(() => {
      result.current.connect('ws://new-server:9090')
    })
    expect(result.current.url).toBe('ws://new-server:9090')
  })

  it('关闭时清理资源 (unmount)', () => {
    const { unmount } = renderHook(() => useROS())
    unmount()
    const rosInstance = getInstances()[0]
    expect(rosInstance.close).toHaveBeenCalled()
  })
})
