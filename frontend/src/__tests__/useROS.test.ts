// @ts-nocheck
/**
 * useROS Hook 测试
 * 覆盖: 初始状态 / 连接成功 / 连接失败 / 断开连接 / URL 管理 / localStorage 持久化
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement } from 'react'
import { useROS, ROSProvider } from '../hooks/useROS'

const TestWrapper = ({ children, initialUrl }: { children: React.ReactNode; initialUrl?: string }) =>
  createElement(ROSProvider, { initialUrl }, children)

// ─── ROSLIB Mock ───────────────────────────────────────

// Track instances at module level
interface MockRosInstance {
  on: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  callOnConnection: ReturnType<typeof vi.fn>
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
        callOnConnection: ReturnType<typeof vi.fn>

        constructor(_options: { url: string }) {
          this.on = vi.fn()
          this.close = vi.fn()
          this.callOnConnection = vi.fn()
          globalThis.__mockRosInstances.push(this as MockRosInstance)
        }
      },
      Service: class {
        callService: ReturnType<typeof vi.fn>
        constructor() {
          this.callService = vi.fn((_req: any, cb: any) => cb({ names: [] }))
        }
      },
      ServiceRequest: class {
        constructor(_values?: Record<string, any>) {}
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
  vi.useFakeTimers()
  Object.defineProperty(global, 'localStorage', {
    value: mockStorage,
    writable: true,
    configurable: true,
  })
  globalThis.__mockRosInstances = []
  mockLocalStorage['rosbridge_url'] = ''
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

const getInstances = () => globalThis.__mockRosInstances as MockRosInstance[]

describe('useROS', () => {
  it('初始状态: connected = false, error = null', () => {
    const { result } = renderHook(() => useROS(), { wrapper: TestWrapper })
    expect(result.current.connected).toBe(false)
    expect(result.current.error).toBe(null)
  })

  it('默认 URL 为 ws://localhost:9090', () => {
    const { result } = renderHook(() => useROS(), { wrapper: TestWrapper })
    expect(result.current.url).toBe('ws://localhost:9090')
  })

  it('自定义 initialUrl', () => {
    const { result } = renderHook(() => useROS(), {
      wrapper: ({ children }: { children: React.ReactNode }) => createElement(ROSProvider, { initialUrl: 'ws://custom:9090' }, children),
    })
    expect(result.current.url).toBe('ws://custom:9090')
  })

  it('从 localStorage 恢复 URL', () => {
    mockLocalStorage['rosbridge_url'] = 'ws://saved:9090'
    const { result } = renderHook(() => useROS(), { wrapper: TestWrapper })
    expect(result.current.url).toBe('ws://saved:9090')
  })

  it('创建 ROSLIB.Ros 实例', () => {
    const { result } = renderHook(() => useROS(), { wrapper: TestWrapper })
    const rosInstance = getInstances()[0]
    const connectionHandler = rosInstance.on.mock.calls.find((call) => call[0] === 'connection')
    act(() => { connectionHandler[1]() })
    expect(result.current.ros).not.toBeNull()
  })

  it('连接成功后更新状态', () => {
    const { result } = renderHook(() => useROS(), { wrapper: TestWrapper })
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
    const { result } = renderHook(() => useROS(), { wrapper: TestWrapper })
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
    const { result } = renderHook(() => useROS(), { wrapper: TestWrapper })
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
    const { result } = renderHook(() => useROS(), { wrapper: TestWrapper })
    act(() => { result.current.disconnect() })
    expect(result.current.connected).toBe(false)
    expect(result.current.ros).toBe(null)
  })

  it('通过 setUrl 切换到新 URL', () => {
    const { result } = renderHook(() => useROS(), { wrapper: TestWrapper })
    act(() => {
      result.current.setUrl('ws://new-server:9090')
    })
    expect(result.current.url).toBe('ws://new-server:9090')
  })

  it('关闭时清理资源 (unmount)', () => {
    const { unmount } = renderHook(() => useROS(), { wrapper: TestWrapper })
    unmount()
    const rosInstance = getInstances()[0]
    expect(rosInstance.close).toHaveBeenCalled()
  })
})
