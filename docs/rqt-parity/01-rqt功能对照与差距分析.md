# rqt 功能对照与差距分析（目标：1:1 复刻到本项目）

> 目标：将 ROS 2 rqt（Humble）的全部插件与框架级功能 1:1 复刻到本 Web 项目。
> 状态标记：✅ 已达对等 / 🟡 部分实现 / ❌ 缺失 / ⚠️ 待核实 / N/A 上游 ROS 2 不存在。
>
> 插件清单已核实（来源：wiki.ros.org/rqt/Plugins + github ros-visualization/rqt_common_plugins **ros2 分支** package.xml + 各插件仓库 humble 分支存在性检查）：
> - **ROS 2 通用插件（16 项）**：rqt_action、rqt_bag(+rqt_bag_plugins)、rqt_console、rqt_graph、rqt_image_view、rqt_msg、rqt_plot、rqt_publisher、rqt_py_console、rqt_reconfigure、rqt_service_caller、rqt_shell、rqt_srv、rqt_topic、rqt_top、rqt_py_common(框架库，非插件)
> - **ROS 2 机器人插件（humble 分支已确认）**：rqt_robot_monitor、rqt_tf_tree、rqt_robot_dashboard、rqt_robot_steering；rqt_joint_trajectory_controller ⚠️（GitHub 查询限流未确认，见待确认问题 Q4）
> - **ROS 2 不存在（无需复刻）**：rqt_logger_level（ros2 元包已移除）、rqt_dep、rqt_launch、rqt_moveit、rqt_rviz、rqt_runtime_monitor、rqt_web

## 1. rqt 框架级功能（rqt_gui）

| rqt 功能 | 本项目现状 | 状态 | 差距与方案 |
|---|---|---|---|
| 插件菜单（列出全部插件，点击打开） | 侧边栏列出全部页面 | ✅ | 等价 |
| 可停靠窗口（拆分/标签/平铺，插件任意摆放） | 单页路由，无多面板 | ❌ | 需实现工作台布局系统（见待确认问题 Q3） |
| 透视 Perspective（保存/切换/删除/导入导出/恢复默认） | 无（仅持久化 rosbridge URL） | ❌ | localStorage + 导入导出 JSON，随布局系统实现 |
| 插件实例状态随透视保存（每个插件的配置） | 各页面会话级状态，无持久化 | 🟡 | 各插件配置接入统一持久化层（plot 优先） |
| 独立运行模式 `rqt --standalone <plugin>` | 每个页面本身就是独立路由 | ✅ | 等价 |

## 2. rqt_common_plugins 逐项对照

### 2.1 rqt_graph（节点图）
| rqt 功能点 | 现状 | 方案 |
|---|---|---|
| 节点/话题关系图渲染 | `/node-graph` SVG 图 | ✅ |
| 刷新按钮 + 刷新间隔 | 手动刷新 | 🟡 加间隔配置 |
| Hide 规则：Dead sinks / Leaf topics / Debug topics | 无 | ❌ 三条隐藏规则复刻 |
| 话题名正则过滤 | 无 | ❌ |
| 按命名空间分组/折叠 | 无 | ❌ |
| 高亮邻居（点节点显示其边） | 无 | ❌ |
| 导出图片（PNG）/导出 dot | 无 | ❌ Canvas 导出 + dot 文本下载 |

### 2.2 rqt_topic（话题列表）
| rqt 功能点 | 现状 | 方案 |
|---|---|---|
| 话题列表 + 类型 | `/topics` 有 | ✅ |
| Hz 列（滚动窗口测频） | 无 | ❌ 订阅测频 |
| Bandwidth 列（B/s） | 无 | ❌ 以 JSON 序列化长度估算（rosbridge 拿不到原始线缆大小，记录为精度差异） |
| 展开行：嵌套字段树 + 每字段 Hz/带宽/当前值 | 仅整条 echo | ❌ 基于消息定义解析器实现字段树 |

### 2.3 rqt_publisher（发布器）
| rqt 功能点 | 现状 | 方案 |
|---|---|---|
| 发布器列表（话题/类型/频率开关/发布计数） | 无（TopicsPage 仅单次 JSON 发布） | ❌ 新建 `/publish` 页 |
| 按消息定义生成嵌套字段编辑器（含默认值、数组增删） | 无 | ❌ 消息定义解析器 + 字段树编辑器 |
| 单次发布 + 按频率发布 | 仅单次 | ❌ |
| 类型浏览/选择 | 无 | 🟡 从 topic_types 补全 + 手输 + get_message_details 校验 |

### 2.4 rqt_msg（消息类型浏览器）
| rqt 功能点 | 现状 | 方案 |
|---|---|---|
| 输入/选择消息类型 → 展示定义、md5、嵌套结构树 | 无 | ❌ 新建 `/msg` 页，rosapi get_message_details |

### 2.5 rqt_service_caller / rqt_srv（服务调用 + 服务类型浏览）
| rqt 功能点 | 现状 | 方案 |
|---|---|---|
| 服务列表 + 调用 + 响应展示 | `/services` 有 | ✅ |
| 请求按 srv 定义生成结构化编辑器（而非裸 JSON/YAML 手写） | JSON 手写 | 🟡 接消息定义解析器生成表单（srv 定义经 get_message_details 是否可查：⚠️ 核实） |
| rqt_srv：服务类型浏览器（定义+md5） | 无 | ❌ 并入 `/msg` 页，支持 srv 类型 |

### 2.6 rqt_action（action 客户端 + 类型浏览）
| rqt 功能点 | 现状 | 方案 |
|---|---|---|
| 发送 goal（goal 编辑器）、goal ID、状态/反馈/结果展示、取消 | 无 | ❌ 新建 `/actions` 页。**已核实可行**：rosbridge ros2 协议含 `send_action_goal`/`cancel_action_goal`/`action_feedback`/`action_result` 操作码，rosapi 提供 `action_servers`/`action_type`/`action_goal_details`/`action_result_details`/`action_feedback_details` 内省服务。目标机器人 rosbridge 版本是否含 action 支持 → Q5 真机核实 |
| action 类型浏览 | 无 | ❌ 并入类型浏览器（action goal/result/feedback 三段） |

### 2.7 rqt_console（控制台日志）
| rqt 功能点 | 现状 | 方案 |
|---|---|---|
| /rosout 实时日志 | `/logs` 有 | ✅ |
| 列：消息/级别/时间戳/节点/话题 | 级别+文本 | 🟡 补节点/话题列 |
| 过滤：include/exclude 按消息/级别/节点/话题/时间范围，支持正则 | 级别+关键词 | 🟡 补全过滤维度 |
| 高亮规则（带颜色） | 无 | ❌ |
| 暂停/恢复、缓冲区大小配置 | 自动滚动开关 | 🟡 |
| 导出文件 | .txt | ✅（补 .csv） |

### 2.8 rqt_logger_level（日志级别设置）
- 上游为 ROS 1 插件；ROS 2（Humble）未发布对应 rqt 插件，且 **ROS 2 的 rosapi 也不提供 get_loggers/set_logger_level 服务**（已对照 rosbridge_suite ros2 分支 rosapi/README.md 核实，ROS 1 时代有、ROS 2 已移除）。**记录为上游缺口：无法复刻**。候选方案：Q1 的后端 CLI（`ros2 service call …/set_parameters` 无法改日志级别；rclpy 日志级别只能节点内部设置）——实际上 ROS 2 架构下日志级别需节点自身配合，Web 端无通用方案，保持 N/A。

### 2.9 rqt_plot（绘图）
| rqt 功能点 | 现状 | 方案 |
|---|---|---|
| 多曲线实时图 | `/charts` recharts | ✅（基础） |
| 曲线表达式按字段路径 `/topic/field/sub`（含数组下标） | 只能整消息取数 | ❌ |
| 多个图窗，各自曲线集 | 单页多话题 | 🟡 |
| 暂停/继续、清空 | 无 | ❌ |
| 数据导出（CSV） | 无 | ❌ |
| 曲线配置持久化 | 无 | ❌ localStorage |

### 2.10 rqt_image_view（图像）
| rqt 功能点 | 现状 | 方案 |
|---|---|---|
| 图像话题选择 + 显示（Image/CompressedImage） | `/images` 有 | ✅ |
| 帧率显示/订阅节流 | FPS 可配 | ✅ |
| 快照保存（超出上游的增强） | 无 | ❌ Canvas 下载 |

### 2.11 rqt_bag（录制/回放）
| rqt 功能点 | 现状 | 方案 |
|---|---|---|
| 录制：话题选择/全部话题/文件前缀/限速 | **UI 假实现（定时器模拟）** | ❌ 需后端执行 ros2 bag（Q1） |
| 回放：时间线、播放/暂停/单步/倍速(0.1x-10x)/跳转 | 假数据 | ❌ 同上 |
| 话题视图插件（raw/缩略图/曲线） | 无 | ❌ 随回放实现 |
| bag 文件列表/信息（时长/大小/起止） | 假数据 | ❌ 同上 |

### 2.12 rqt_top（节点资源占用）
| rqt 功能点 | 现状 | 方案 |
|---|---|---|
| 每节点 CPU%/MEM%/状态，周期刷新 | 无 | ❌ 需后端在机器人侧读取进程状态（Q1） |

### 2.13 rqt_shell（远程终端）/ rqt_py_console（Python 控制台）
| rqt 功能点 | 现状 | 方案 |
|---|---|---|
| 在机器人环境执行 shell / Python(含 rclpy) | 无 | ❌ 后端 WebSocket PTY / 受控执行，安全模型见 Q2 |

### 2.14 rqt_reconfigure（动态参数）
| rqt 功能点 | 现状 | 方案 |
|---|---|---|
| 按节点分组树 + 过滤 | `/params` 树形（基于参数路径） | 🟡 按节点段分组强化 |
| 类型化编辑器（bool/整型/浮点/字符串，min/max 滑条） | 通用文本 | ❌ 按当前值类型推断编辑器；⚠️ rosapi 无参数描述符(min/max)→滑条降级为直接输入，记录精度差异 |
| 修改/新增/删除参数 | 有 | ✅ |

## 3. rqt_robot_plugins 逐项对照

### 3.1 rqt_robot_monitor（诊断监视器）
| rqt 功能点 | 现状 | 方案 |
|---|---|---|
| 订阅 /diagnostics（diagnostic_msgs/DiagnosticArray），按 name 树形展示、级别着色、汇总、详情面板 | 无（现有 `/diagnostics` 是"AI 诊断"，与此无关） | ❌ 新建 `/robot-monitor` 页 |
| 状态计数汇总（OK/WARN/ERROR/STALE） | 无 | ❌ |

### 3.2 rqt_tf_tree
| rqt 功能点 | 现状 | 方案 |
|---|---|---|
| TF 树图 + 刷新间隔 + 过滤 + 导出 | `/tf` 列表 + `/tf-diagnostics` 规则检测 + `/tf3d` 3D | 🟡 补图形式树渲染与导出 |
| frames.yaml 视图（全部帧原始数据） | 无 | ❌ |

### 3.3 rqt_joint_trajectory_controller
- 控制器选择、关节滑条、下发 JointTrajectory。依赖 ros2_control/joint_trajectory_controller 栈是否在用（Q4）。
- 现状 ❌；方案：通过 /controller_manager 服务枚举控制器 + 订阅关节状态 + 发布轨迹，纯前端可实现。

### 3.4 rqt_robot_dashboard
- 通用仪表盘框架（为具体机器人定制插件），⚠️ ROS 2 Humble 是否有发布包待核实；即使有，其价值依具体机器人而定（Q4）。

### 3.5 N/A（上游未移植到 ROS 2，本项目记录等效替代）
| 插件 | 说明 | Web 等效 |
|---|---|---|
| rqt_rviz | ROS 2 未移植（rviz2 即本体） | 本项目 `/tf3d`、`/pointcloud`、`/map`、`/laserscan` 覆盖常用可视化；完整 rviz2 复刻超出 rqt 范畴（rqt_rviz 在 ROS 2 不存在） |
| rqt_moveit | 未移植 | N/A，如需 MoveIt 调试另行立项 |
| rqt_runtime_monitor | 未移植（被 rqt_robot_monitor 取代） | 由 3.1 覆盖 |
| rqt_launch | 未移植 | 后端 CLI 方案可覆盖（Q1），非 1:1 范畴 |
| rqt_dep / rqt_logger_level | 未移植 / 见 2.8 | N/A |

## 4. 实施分期

- **Phase A（纯前端，无新依赖，不依赖待确认问题）**：消息定义解析器+测试、rqt_msg、rqt_publisher、rqt_topic 增强、rqt_console 增强、rqt_robot_monitor、rqt_plot 增强、rqt_graph 增强、rqt_action、rqt_reconfigure 增强、rqt_tf_tree 增强、图像快照。
- **Phase B（需后端能力，依赖 Q1/Q2 确认）**：rqt_bag（真实录制/回放）、rqt_top、rqt_shell、rqt_py_console、logger 级别降级方案。
- **Phase C（布局架构，依赖 Q3 确认）**：工作台 + 透视系统。
- **Phase D（依赖机器人栈，依赖 Q4 确认）**：rqt_joint_trajectory_controller、dashboard。
