# Phase 1 基础调试 - 开发计划

## 当前状态
- v1.0 已完成 7 个基础页面（Status/Nodes/Topics/Services/Params/Logs/TF）
- 后端仅健康检查，无 ROS Bridge 代理
- useROS hook 直接连 rosbridge，无重连/多 Master 支持
- docker-compose.yml 存在但需完善

## Phase 1 开发项（对应 ROSDD 项目）

### 1. Docker Compose 配置完善 (ROSDD-1)
**优先级**: medium | **状态**: Backlog

**需求**:
- [ ] 添加 .env 文件支持（端口、ROS Master URI）
- [ ] 分离开发环境和生产环境配置
- [ ] 添加 volume 挂载（日志持久化）
- [ ] 添加 healthcheck
- [ ] 支持 Jetson ARM64 架构
- [ ] 添加 README Docker 使用说明

### 2. rosbridge 连接管理 (ROSDD-2)  
**优先级**: medium | **状态**: Backlog

**需求**:
- [ ] 断线自动重连（指数退避）
- [ ] 多 ROS Master 切换（下拉选择）
- [ ] 连接状态 UI 反馈（loading/error/connected）
- [ ] 连接 URL 可配置（前端设置页面）
- [ ] 连接超时检测

### 3. 节点拓扑图可视化 (ROSDD-3)
**优先级**: medium | **状态**: Todo

**需求**:
- [ ] 使用 react-flow 展示节点关系图
- [ ] 节点间连线（话题发布/订阅关系）
- [ ] 点击节点显示详情
- [ ] 自动布局

### 4. 话题消息速率监控 (ROSDD-4)
**优先级**: medium | **状态**: Todo

**需求**:
- [ ] 实时统计各话题消息频率（条/秒）
- [ ] 速率表格，支持排序
- [ ] 速率图表（recharts 折线图）

### 5. CPU/内存资源面板 (ROSDD-5)
**优先级**: high | **状态**: Todo

**需求**:
- [ ] 通过 rosbridge 获取系统资源信息
- [ ] CPU 使用率仪表盘
- [ ] 内存使用量/总量显示
- [ ] 磁盘空间显示

### 6. 话题波形图 (ROSDD-6)
**优先级**: medium | **状态**: Todo

**需求**:
- [ ] 数值型话题实时波形显示
- [ ] 支持多话题叠加
- [ ] 时间轴缩放
- [ ] 数据导出

## 开发顺序
1. 连接管理 (ROSDD-2) - 基础
2. Docker Compose (ROSDD-1) - 部署
3. 节点拓扑图 (ROSDD-3) - 可视化
4. 话题速率 (ROSDD-4) - 监控
5. 资源面板 (ROSDD-5) - 系统信息
6. 话题波形图 (ROSDD-6) - 高级

## Issue 跟踪
所有开发中的问题通过 ROSDD 项目 issue 跟踪
