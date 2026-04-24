# ROS 开发调试系统 🤖

> Web 化的 ROS 日常开发调试工具，帮助开发人员高效进行 ROS 系统开发、调试和性能分析。

[![GitHub](https://img.shields.io/github/stars/jhaiq/ros-dev-debug-system?style=social)](https://github.com/jhaiq/ros-dev-debug-system)
![Version](https://img.shields.io/badge/version-v3.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ 功能特性

### Phase 1 — 核心修复 🔴
- 🖥️ **节点管理** — 查看和管理 ROS 节点，支持搜索过滤
- 📡 **话题监控** — 实时订阅话题数据，支持消息发布与取消订阅
- 🔧 **服务调用** — 动态查询 ServiceType，可视化调用 ROS 服务
- ⚙️ **参数服务器** — 参数浏览、修改、搜索，树形结构展示
- 📋 **日志系统** — 实时查看 ROS 日志
- 🌳 **TF 列表** — 通过 `/tf` 和 `/tf_static` 话题获取 TF 树
- 🔗 **连接管理** — URL 持久化 (localStorage)、自动重连、可配置超时
- ⚙️ **连接设置页** — 独立设置页面，管理 rosbridge 连接

### Phase 2 — 实时监控 🟡
- 📈 **实时图表** — recharts 实时折线图，多话题同时监控，可配置数据点
- 📊 **仪表盘** — 系统概览卡片、负载趋势图、资源占用进度条
- 🖼️ **图像话题** — sensor_msgs/Image 和 CompressedImage 显示，可配置 FPS
- 📦 **TF 3D** — Three.js + React Three Fiber 3D TF 坐标系可视化
- 🔗 **节点图** — SVG 可视化节点-话题发布/订阅依赖关系

### Phase 3 — 机器人控制 🔵
- 🎮 **机器人控制** — 遥控器模式 + WASD 键盘控制，服务调用面板，紧急停止
- 💾 **Bag 管理** — 录制（话题选择/开始/暂停/停止）+ 回放（0.1x-10x 速度）+ 文件列表

### Phase 4 — 传感器可视化 🟣
- 🗺️ **地图可视化** — nav_msgs/OccupancyGrid + nav_msgs/Path，Canvas 2D 渲染
- ☁️ **点云 3D** — sensor_msgs/PointCloud2 Three.js 渲染，支持 rgb/intensity 着色
- 📡 **激光雷达** — sensor_msgs/LaserScan 极坐标 Canvas 渲染 + recharts 折线图
- 🔍 **TF 诊断** — 自动检测循环依赖、孤立帧、多根帧、NaN 值，6 条规则

### Phase 5 — 性能分析 🟠
- 🔎 **调用链追踪** — Jaeger 风格时间线，trace_id 注入，端到端延迟统计
- ⏱️ **延迟监控** — 话题延迟热力图，p50/p90/p95/p99 百分位统计
- 🛡️ **瓶颈检测** — 自动检测高频延迟/延迟尖峰/消息堆积，话题健康度评分

## 📸 页面总览

| 页面 | 路径 | 阶段 |
|------|------|------|
| 机器人状态 | `/` | Phase 1 |
| 仪表盘 | `/dashboard` | Phase 2 |
| 节点管理 | `/nodes` | Phase 1 |
| 话题监控 | `/topics` | Phase 1 |
| 服务调用 | `/services` | Phase 1 |
| 参数服务器 | `/params` | Phase 1 |
| TF 列表 | `/tf` | Phase 1 |
| 日志系统 | `/logs` | Phase 1 |
| 连接设置 | `/settings` | Phase 1 |
| 实时图表 | `/charts` | Phase 2 |
| 图像话题 | `/images` | Phase 2 |
| TF 3D | `/tf3d` | Phase 2 |
| 节点图 | `/node-graph` | Phase 2 |
| 机器人控制 | `/control` | Phase 3 |
| Bag 管理 | `/bag` | Phase 3 |
| 地图 | `/map` | Phase 4 |
| 点云 | `/pointcloud` | Phase 4 |
| 激光雷达 | `/laserscan` | Phase 4 |
| TF 诊断 | `/tf-diagnostics` | Phase 4 |
| **调用链** | `/trace` | **Phase 5** |
| **延迟监控** | `/latency` | **Phase 5** |
| **瓶颈检测** | `/bottleneck` | **Phase 5** |

## 🚀 快速开始

### 前置要求

- Node.js 18+
- ROS (Noetic/Humble)
- rosbridge_suite

### 本地开发

```bash
# 启动 rosbridge
roslaunch rosbridge_server rosbridge_websocket.launch

# 安装依赖
cd frontend && npm install
cd ../backend && npm install
cd ../proxy && npm install

# 启动服务
# 终端 1: 后端
cd backend && npm start

# 终端 2: 前端
cd frontend && npm run dev

# 终端 3: Trace Proxy (可选，用于 Phase 5 性能分析)
cd proxy && npm start
```

### Docker 一键部署

```bash
# 完整环境（含 rosbridge + Trace Proxy）
cd docker && docker-compose up -d

# 仅 ros-dev-debug + rosbridge
docker-compose up -d ros-dev-debug rosbridge
```

## 📁 项目结构

```
ros-dev-debug-system/
├── frontend/              # React + TypeScript 前端 (22 页面)
│   ├── src/
│   │   ├── pages/         # 22 个功能页面
│   │   ├── hooks/         # useROS Hook
│   │   └── App.tsx        # 路由配置
│   ├── vite.config.js
│   └── package.json
├── backend/               # Express 后端
│   ├── src/
│   │   ├── index.js       # API 服务
│   │   └── proxy.js       # 内置 Proxy (备选)
│   └── package.json
├── proxy/                 # 独立 Trace Proxy (推荐)
│   ├── src/
│   │   └── index.js       # WebSocket 拦截 + 延迟统计
│   └── package.json
├── docker/
│   ├── docker-compose.yml # 一键部署
│   ├── Dockerfile         # 主服务
│   └── Dockerfile.proxy   # Trace Proxy
├── docs/                  # 使用文档
└── README.md
```

## 🛠️ 技术栈

| 层 | 技术 |
|----|------|
| **前端** | React 18 + TypeScript + TailwindCSS + Vite |
| **可视化** | recharts, Three.js, React Three Fiber, Canvas 2D |
| **后端** | Node.js + Express |
| **通信** | WebSocket (rosbridge + 独立 Proxy) |
| **部署** | Docker + Docker Compose |

## 📊 构建状态

```
✅ TypeScript 编译零错误
✅ Vite 构建: 1,729 KB JS (gzip: 488 KB)
✅ 22 个功能页面
✅ Docker 一键部署
```

## 📖 文档

- [使用指南](docs/usage.md)
- [开发计划](docs/dev-plan.md)

## 📝 开发计划

| 阶段 | 状态 | 说明 |
|------|------|------|
| Phase 1 | ✅ 完成 | 核心 Bug 修复 + 连接管理 |
| Phase 2 | ✅ 完成 | 实时监控 + 3D 可视化 |
| Phase 3 | ✅ 完成 | 机器人控制 + Bag 管理 |
| Phase 4 | ✅ 完成 | 传感器可视化 + TF 诊断 |
| Phase 5 | ✅ 完成 | 调用链追踪 + 性能分析 |
| Phase 5 P2 | 📋 待开发 | NodeGraphPage 延迟叠加 |
| Phase 5 P3 | 📋 待开发 | AI 辅助诊断 |

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License
