# rqt 1:1 复刻 — Phase A 实施状态报告

> 日期：2026-09-03
> 范围：Phase A — 纯前端可实现的 ROS 2 Humble rqt 插件复刻（无需后端 CLI/机器人进程/布局系统）

## 已完成的复刻项

| rqt 插件 | 对应页面 | 实现内容 |
|---|---|---|
| rqt_msg / rqt_srv | `/types` | 消息/服务/Action 类型浏览器：按 rosapi `message_details`/`service_request_details`/`service_response_details`/`action_*_details` 解析并展示嵌套字段树、常量 |
| rqt_publisher | `/publish` | 发布器列表、频率/开关/计数、按消息定义生成默认值字段编辑器、单次/周期发布 |
| rqt_action | `/actions` | Action 服务器列表、goal 编辑器、send/cancel goal、状态/反馈/结果展示、rosbridge action 能力探测提示 |
| rqt_robot_monitor | `/robot-monitor` | 订阅 `/diagnostics`，按 name 树形展示，OK/WARN/ERROR/STALE 汇总，详情面板 |
| rqt_console | `/logs` | 列：时间/级别/节点/话题/文件；include/exclude 过滤；高亮规则；暂停/继续；缓冲区大小；TXT/CSV 导出 |
| rqt_topic | `/topics` | 列表新增 Hz、带宽列（JSON 长度估算）、字段树 + 实时字段值 |
| rqt_plot | `/charts` | 字段路径曲线 `/topic/field/sub`、多曲线合图、多图窗、暂停、清空、CSV 导出、localStorage 持久化 |
| rqt_graph | `/node-graph` | Dead sinks / Leaf topics / Debug topics 隐藏、话题正则过滤、节点/话题名搜索（含邻居保留）、邻居高亮、刷新间隔、导出 dot / PNG |
| rqt_reconfigure | `/params` | 树形/按节点分组双视图、类型化编辑器（bool/number/string/json） |
| rqt_tf_tree | `/tf` | 树形视图、图形视图、frames.yaml 文本视图、刷新间隔、导出 PNG / 文本 |
| rqt_image_view | `/images` | FPS、暂停、全屏、快照保存、原始图像渲染（RGB8/BGR8/RGBA8） |

## 新增/增强的共享基础设施

- `src/lib/message-def.ts`：rosapi TypeDef 解析器 → 字段树、常量、默认值。
- `src/lib/rosapi.ts`：已按 rosbridge_suite ros2 分支核实的 rosapi Promise 封装。
- `src/components/MessageFieldEditor.tsx`：按消息定义生成的嵌套字段编辑器（rqt_publisher / rqt_service_caller / rqt_action 共用）。
- `src/roslib.d.ts`：补充 `callOnConnection`、`failedCallback`、`unsubscribe` 等类型。

## 构建与测试

- `frontend`：`npm run build` ✅，production bundle 1.8MB（警告：chunk > 500KB，功能完整后可通过 code-split 优化）。
- `frontend`：`npx vitest run` ✅ 25 tests passing（含新增 `message-def.test.ts` 14 个测试）。
- `backend`：`npm test` ✅ 10 tests passing。
- `proxy`：`npm test` ✅ 91 tests passing。

## 已发现的、不依赖人工决策的问题

1. `docker/docker-compose.yml` 仍使用 ROS 1 `ros:noetic-ros-base` 和 `roslaunch`，与项目 README/verify 脚本目标 ROS 2 Humble 不一致。已列入 `02-问题与人工确认清单.md` Q6。
2. rqt_logger_level：经核实，rosapi ros2 分支未提供 get_loggers/set_logger_level，上游 rqt 元包也已移除。记录为 ROS 2 架构限制，不纳入 1:1 范围（见差距分析文档 2.8 + Q8）。

## 仍需人工确认/决策（Phase B/C/D 阻塞项）

见 [02-问题与人工确认清单.md](./02-问题与人工确认清单.md)：
- **Q1** backend 是否部署在机器人侧以支持 bag/top/shell/py_console 后端能力？
- **Q2** 远程 shell/Python 控制台的安全边界（认证/白名单）？
- **Q3** 是否引入 `react-mosaic` 类库实现 rqt 式可停靠窗口 + 透视系统？
- **Q4** rqt_joint_trajectory_controller / rqt_robot_dashboard / rqt_robot_steering 是否按需实现？
- **Q5** 真机上 rosbridge_suite 版本是否包含 action 支持？
- **Q6** docker-compose 是否统一改为 ROS 2 Humble？
- **Q8** 上游 ROS 2 不存在的插件是否同意排除？

## 已知精度差异（已记录于 Q7）

- `rqt_topic` 带宽列：rosbridge 拿不到 DDS 线缆字节，用 JSON 序列化长度估算，标注 `≈`。
- `rqt_reconfigure` 滑条：rosapi 无参数描述符（min/max/step），按值类型推断编辑器。
- `rqt_plot` 取数：rosbridge 传 JSON，字段路径表达式等价取数。

---

下一步：等待人工确认上述问题后，实施 Phase B（后端 CLI 能力）、Phase C（工作台/透视）、Phase D（机器人栈插件）。
