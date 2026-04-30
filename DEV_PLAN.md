# ROS 开发调试系统 - 开发计划

**版本**: v1.0 → v3.0  
**日期**: 2026-04-24  
**目标**: 修复 Bug + 增强功能 + 性能分析，打造专业级 ROS Web 调试工具

---

## Phase 1: 修复现有 Bug 🔴 ✅ 已完成

### 1.1 useROS Hook ✅
- [x] 修复内存泄漏 - 新增 cleanup 机制
- [x] 添加自动重连 - 连接断开后自动重连
- [x] URL 配置 - localStorage 持久化连接地址
- [x] 连接超时控制 - 自动重连间隔可配置

### 1.2 修复 ROS API 调用 ✅
- [x] TopicsPage - 修复订阅/取消订阅逻辑，使用 `topics_and_raw_types`
- [x] ServicesPage - 动态获取服务类型，不再硬编码 `std_srvs/Empty`
- [x] ParamsPage - 使用 `rosapi/GetParamNames` 替代不存在的 `GetParams`
- [x] TFPage - 通过 `/tf` 话题订阅获取 TF 树
- [x] StatusPage - 修复电池订阅泄漏，添加参数计数
- [x] NodesPage - 修复 TypeScript 类型 + 添加搜索功能

### 1.3 连接管理 ✅
- [x] 连接设置页面 (SettingsPage)
- [x] URL 配置 + localStorage 持久化
- [x] 连接状态指示 (侧边栏实时显示)
- [x] 自动重连 + 可配置间隔

### 1.4 TypeScript 修复 ✅
- [x] `ROSLIB.ROS` → `ROSLIB.Ros`
- [x] `Service.call()` → `Service.callService()`
- [x] 移除所有未使用变量

---

## Phase 2: 功能增强 🟡 ✅ 已完成

### 2.1 实时监控 ✅
- [x] **ChartsPage** — 话题数据实时图表（recharts）
- [x] **DashboardPage** — 仪表盘 + 负载趋势图
- [x] **ImageViewerPage** — 图像话题显示

### 2.2 3D 可视化 ✅
- [x] **TF3DPage** — Three.js 3D TF 可视化
- [x] **NodeGraphPage** — 节点-话题依赖图

---

## Phase 3: 高级工具 🔵 ✅ 已完成

- [x] **ControlPage** — 遥控器 + WASD 键盘控制 + 紧急停止
- [x] **BagPage** — 录制/回放/文件列表

---

## Phase 4: 传感器可视化 + 诊断 🟣 ✅ 已完成

### 4.1 传感器可视化 ✅
- [x] **MapViewerPage** — OccupancyGrid + Path Canvas 2D
- [x] **PointCloudPage** — PointCloud2 Three.js 3D
- [x] **LaserScanPage** — 极坐标 Canvas + recharts

### 4.2 TF 诊断 ✅
- [x] **TFDiagnosticsPage** — 6 条自动检测规则

---

## Phase 5: ROS 调用链追踪与性能分析 🟠 ✅ P0+P1 已完成

### 5.1 后端 Proxy (P0) ✅
- [x] 独立 WebSocket Proxy（端口 9091）
- [x] 消息 trace_id 注入 + 延迟统计
- [x] 环形缓冲区 (10000 条) + REST API + 实时 WS 推送
- [x] 自动瓶颈检测 (4 条规则)
- [x] API 端点: `/api/traces`, `/api/latency`, `/api/bottlenecks`, `/api/stats`

### 5.2 前端页面 ✅
- [x] **TracePage** — Jaeger 风格调用链时间线 (P0)
- [x] **LatencyPage** — 延迟热力图 + 百分位统计 (P1)
- [x] **BottleneckPage** — 瓶颈检测 + 健康度评分 (P1)

### 5.3 增强
- [ ] **NodeGraphPage** — 叠加延迟热力 + trace 回放 (P2)

### 5.4 AI 辅助诊断 (P3)
- [ ] 异常检测 + 根因分析 + 智能建议

**已完成**: Phase 5 P0+P1 (commit d116690)  
**待完成**: P2 NodeGraphPage 增强 + P3 AI 诊断

---

## 构建状态

- ✅ TypeScript 编译零错误 (`tsc --noEmit`)
- ✅ Vite 构建成功 (`vite build`)
- JS: 1,729 KB (gzip: 488 KB)
- CSS: 21.5 KB (gzip: 4.5 KB)
- 总页面数: **22**

---

## 部署

### Docker 一键启动
```bash
cd docker && docker-compose up -d
```

### 服务端口
| 服务 | 端口 | 说明 |
|------|------|------|
| 主后端 | 4000 | Express API + 静态文件 |
| rosbridge | 9090 | ROS WebSocket 桥接 |
| Trace Proxy | 9091 | WebSocket 代理 |
| Trace API | 9092 | REST API + WS 推送 |

---

## Git 提交记录

| Commit | 说明 |
|--------|------|
| `d116690` | Phase 5: ROS 调用链追踪与性能分析 |
| `9c2654f` | Phase 1-4 重建完成 |
| `d7d34e7` | Initial commit: ROS 开发调试系统 v1.0 |

远程: `https://github.com/jhaiq/ros-dev-debug-system`

---

*创建时间: 2026-04-22 21:50*  
*最后更新: 2026-04-24 13:00*
