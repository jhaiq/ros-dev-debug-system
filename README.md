# ROS 开发调试系统 🤖

Web 化的 ROS 日常开发调试工具，帮助开发人员高效进行 ROS 系统开发、调试和定位。

## ✨ 功能特性

- 🖥️ **节点管理** - 查看和管理 ROS 节点状态
- 📡 **话题监控** - 实时监控话题数据，支持消息发布
- 🔧 **服务调用** - 可视化调用 ROS 服务
- ⚙️ **参数服务器** - 管理和修改 ROS 参数
- 📋 **日志系统** - 实时查看 ROS 日志，支持过滤和搜索
- 🌳 **TF 可视化** - 查看坐标系变换树
- 🤖 **机器人状态** - 显示机器人基本信息

## 🚀 快速开始

### 前置要求

- Node.js 18+
- ROS (Noetic/Melodic)
- rosbridge_suite

### 安装 rosbridge

```bash
sudo apt-get install ros-noetic-rosbridge-server
```

### 启动 rosbridge

```bash
roslaunch rosbridge_server rosbridge_websocket.launch
```

### 启动开发调试系统

```bash
# 安装依赖
cd ros-dev-debug-system
npm install

# 启动后端
cd backend && npm start

# 启动前端（新终端）
cd frontend && npm start
```

### Docker 部署（推荐）

```bash
docker-compose up -d
```

## 📁 项目结构

```
ros-dev-debug-system/
├── frontend/           # React 前端
├── backend/            # Node.js 后端
├── docker/             # Docker 配置
├── docs/               # 文档
└── README.md
```

## 🛠️ 技术栈

- **前端**: React 18 + TypeScript + TailwindCSS + roslibjs
- **后端**: Node.js + Express + roslibjs
- **通信**: WebSocket (rosbridge)
- **部署**: Docker + Docker Compose

## 📖 使用说明

详见 [docs/usage.md](docs/usage.md)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License
