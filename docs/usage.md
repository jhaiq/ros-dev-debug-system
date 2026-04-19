# ROS 开发调试系统 - 使用指南

## 快速开始

### 1. 环境准备

确保已安装：
- Node.js 18+
- ROS (Noetic/Melodic)
- rosbridge_suite

```bash
# 安装 rosbridge
sudo apt-get install ros-noetic-rosbridge-server
```

### 2. 启动 ROS 环境

```bash
# 终端 1: 启动 roscore
roscore

# 终端 2: 启动 rosbridge
roslaunch rosbridge_server rosbridge_websocket.launch

# 终端 3: 启动 rosapi（可选，用于获取系统信息）
rosrun rosapi rosapi_node.py
```

### 3. 启动开发调试系统

#### 开发模式

```bash
# 安装依赖
cd ros-dev-debug-system
cd backend && npm install
cd ../frontend && npm install

# 启动后端
cd backend && npm start

# 新终端启动前端
cd frontend && npm run dev
```

访问 http://localhost:3000

#### Docker 模式（推荐）

```bash
cd docker
docker-compose up -d
```

访问 http://localhost:4000

## 功能说明

### 🤖 机器人状态
- 查看 ROS 连接状态
- 显示电池电量（如有 /battery_state 话题）
- 统计节点、话题、服务数量

### 📦 节点管理
- 查看所有运行中的 ROS 节点
- 查看每个节点的发布/订阅话题
- 查看节点提供的服务

### 📡 话题监控
- 浏览所有话题列表
- 实时查看话题消息
- 发布自定义消息到话题
- 支持 JSON 格式消息

### 🔧 服务调用
- 浏览所有服务列表
- 调用服务并查看响应
- 支持自定义请求参数

### ⚙️ 参数服务器
- 树形展示所有参数
- 查看/修改参数值
- 删除参数

### 📋 日志系统
- 实时查看 ROS 日志
- 按级别过滤（DEBUG/INFO/WARNING/ERROR/FATAL）
- 搜索日志内容
- 导出日志文件

### 🌳 TF 树
- 可视化展示坐标系变换树
- 展开/收起子坐标系
- 了解机器人坐标系结构

## 常见问题

### 无法连接 ROS

1. 确保 roscore 正在运行
2. 检查 rosbridge 是否启动：`roslaunch rosbridge_server rosbridge_websocket.launch`
3. 确认防火墙未阻止 9090 端口

### 看不到节点/话题数据

确保已安装并启动 rosapi：
```bash
sudo apt-get install ros-noetic-rosapi
rosrun rosapi rosapi_node.py
```

### Docker 连接问题

确保 Docker 容器可以访问宿主机的 ROS 网络：
```yaml
network_mode: "host"  # 或使用正确的网络配置
```

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| /health | GET | 健康检查 |
| /api/status | GET | 系统状态 |

## 技术架构

```
┌─────────────┐     WebSocket      ┌─────────────┐
│   Browser   │ ◄────────────────► │  rosbridge  │
│   (React)   │     (9090)         │   Server    │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │ HTTP (4000)                      │ ROS
       │                                  │
┌──────▼──────┐                    ┌──────▼──────┐
│   Backend   │                    │   ROS Core  │
│  (Express)  │                    │  (roscore)  │
└─────────────┘                    └─────────────┘
```

## 扩展开发

### 添加新功能页面

1. 在 `frontend/src/pages/` 创建新组件
2. 在 `App.tsx` 中添加路由
3. 在侧边栏添加导航链接

### 添加新的 ROS 服务调用

在对应的页面组件中使用 ROSLIB:

```javascript
const service = new ROSLIB.Service({
  ros,
  name: '/your_service',
  serviceType: 'your_package/YourService'
})

service.callService(request, (result) => {
  console.log(result)
})
```
