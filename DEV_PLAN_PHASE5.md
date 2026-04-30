# ROS 开发调试系统 - Phase 5 开发计划

**版本**: v2.0 → v3.0  
**日期**: 2026-04-23  
**目标**: ROS 通信链路追踪 + 性能分析 + AI 辅助诊断

---

## Phase 5: ROS 调用链追踪与性能分析 🟠

### 核心理念

将微服务调用链追踪（Jaeger/Zipkin/SkyWalking）的机制应用于 ROS 消息通信：

| 微服务概念 | ROS 对应 |
|------------|----------|
| Trace ID | 消息 trace_id + hop_count |
| Span | 发布→订阅延迟区间 |
| Service A → B | Node A → Topic → Node B |
| HTTP Request/Response | ROS Service call |
| Latency Heatmap | 话题消息延迟分布 |
| Bottleneck Detection | 高频延迟/队列堆积节点 |

### 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                     ROS Bridge Server                    │
│              (ws://localhost:9090)                        │
└──────────────────────┬──────────────────────────────────┘
                       │ WebSocket (原始)
                       ▼
┌─────────────────────────────────────────────────────────┐
│              中间层 Proxy (推荐方案 B)                    │
│                                                           │
│  Node.js + ws 库                                         │
│  - 拦截所有 pub/sub 消息                                  │
│  - 注入 metadata (trace_id, timestamp, hop_count)         │
│  - 记录延迟统计                                           │
│  - 前端页面通过独立 WebSocket 连接获取追踪数据              │
│                                                           │
│  端口: 9091                                               │
└───────────┬──────────────────────┬───────────────────────┘
            │                      │
            ▼                      ▼
┌───────────────────┐  ┌─────────────────────────────────┐
│  前端 TracePage    │  │  前端 LatencyPage               │
│  (调用链时间线)     │  │  (延迟热力图)                    │
└───────────────────┘  └─────────────────────────────────┘
                       ┌─────────────────────────────────┐
                       │  前端 BottleneckPage            │
                       │  (瓶颈检测)                      │
                       └─────────────────────────────────┘
```

### 为什么不选其他方案？

| 方案 | 缺点 |
|------|------|
| A: rosbridge 中间层 | 需要修改 rosbridge_server 源码，升级维护困难 |
| C: ROS 节点 wrapper | 需要修改所有业务节点代码，侵入性太高 |
| **B: 独立 Proxy** | ✅ 零侵入，独立部署，不影响业务节点 |

---

## 5.1 后端 Proxy 开发

### 5.1.1 新建文件: `proxy/src/index.js`

**功能清单：**

- [ ] 双 WebSocket 连接管理
  - 上游: 连接 rosbridge_server (ws://localhost:9090)
  - 下游: 监听前端连接 (ws://0.0.0.0:9091)
- [ ] 消息拦截与注入
  - 拦截 `publish` 和 `subscribe` 操作消息
  - 为每个消息注入 `trace_id`（UUID v4）
  - 记录 `publish_timestamp`、`subscribe_timestamp`
  - 维护 `hop_count`（消息转发次数）
- [ ] 延迟计算
  - publish → subscribe 延迟（端到端）
  - 按话题分类统计
  - 百分位统计 (p50, p90, p95, p99)
- [ ] 追踪数据存储
  - 内存环形缓冲区（最近 N 条 trace）
  - 按 trace_id 索引
  - 支持按话题/节点/时间范围查询
- [ ] 前端 API 端点
  - `GET /api/traces` — 获取追踪列表
  - `GET /api/traces/:id` — 获取单条 trace 详情
  - `GET /api/latency` — 获取延迟统计
  - `GET /api/bottlenecks` — 获取瓶颈检测
  - `GET /api/stats` — 实时统计摘要
  - `WS /ws/traces` — 实时推送 trace 更新

**技术栈：**
- `ws` — WebSocket 库
- `uuid` — 生成 trace_id
- 无额外数据库依赖（内存存储，保持轻量）

### 5.1.2 消息格式设计

```javascript
// 注入的 trace metadata
{
  "_meta": {
    "trace_id": "a1b2c3d4-e5f6-...",     // 全局唯一
    "topic": "/scan",                    // 话题名
    "node": "velodyne_driver",           // 发布节点
    "publish_ts": 1713830400123,         // 发布时间戳 (ms)
    "subscribe_ts": 1713830400145,       // 订阅接收时间戳 (ms)
    "latency_ms": 22,                    // 端到端延迟
    "hop_count": 1,                      // 转发跳数
    "msg_size_bytes": 4096,              // 消息大小
    "msg_type": "sensor_msgs/LaserScan"  // 消息类型
  }
}
```

### 5.1.3 延迟统计算法

```javascript
// 按话题维护滑动窗口统计
const topicStats = {
  "/scan": {
    count: 1000,
    latencies: [12, 15, 22, 8, 11, ...],  // 最近 1000 条
    p50: 14,
    p90: 28,
    p95: 35,
    p99: 52,
    max: 89,
    min: 5,
    avg: 16.3,
    msgs_per_sec: 10.2
  }
};
```

### 5.1.4 瓶颈检测规则

```javascript
// 自动检测规则
const bottleneckRules = [
  { name: "高频延迟",     condition: "p95 > 100ms && count > 50" },
  { name: "延迟尖峰",     condition: "max > p99 * 3" },
  { name: "消息堆积",     condition: "msgs_per_sec > 100 && latency 持续上升" },
  { name: "单点瓶颈",     condition: "某节点订阅数 > 10 且延迟高" },
  { name: "长链路",       condition: "hop_count > 3" },
  { name: "大消息",       condition: "msg_size_bytes > 1MB" }
];
```

---

## 5.2 前端页面开发

### 5.2.1 TracePage — 调用链时间线

**文件**: `frontend/src/pages/TracePage.tsx`

**功能：**
- [ ] 类似 Jaeger UI 的调用链时间线视图
  - 横向时间轴，每个 span 用横条表示
  - 颜色编码：正常（绿色）、警告（黄色）、延迟（红色）
- [ ] Trace 列表
  - 按时间倒序显示最近 N 条 trace
  - 支持按话题、节点、时间范围过滤
  - 搜索框
- [ ] Trace 详情展开
  - 显示完整消息路径
  - 每个 hop 的延迟
  - 消息大小、类型
- [ ] 实时模式
  - 自动刷新最新 trace
  - 可暂停/恢复
- [ ] 导出功能
  - 导出为 JSON
  - 导出选定 trace 为图片

**UI 组件结构：**
```
TracePage
├── TraceFilterBar      # 过滤栏（话题/时间/搜索）
├── TraceList           # trace 列表
│   └── TraceItem       # 单条 trace 卡片
│       └── TraceTimeline  # 展开后的时间线
│           ├── TraceSpan  # 单个 span 横条
│           └── TraceHop   # 跳数详情
└── TraceDetailPanel    # 右侧详情面板
```

### 5.2.2 LatencyPage — 延迟热力图

**文件**: `frontend/src/pages/LatencyPage.tsx`

**功能：**
- [ ] 话题延迟热力图
  - X 轴：时间（最近 5/15/30/60 分钟）
  - Y 轴：话题列表
  - 颜色：延迟值（绿→黄→红）
- [ ] 延迟分布图
  - 每个话题的延迟百分位统计 (p50/p90/p95/p99)
  - recharts 箱线图或条形图
- [ ] 实时延迟趋势
  - 选择单个话题，查看延迟随时间变化
  - 折线图 + 百分位带
- [ ] 话题对比
  - 同时对比多个话题的延迟分布
- [ ] 统计面板
  - 每个话题的 消息数、平均延迟、最大延迟、吞吐率

**UI 组件结构：**
```
LatencyPage
├── HeatmapChart        # 话题×时间 延迟热力图
├── LatencyDistribution # 延迟分布箱线图
├── TrendChart          # 单话题延迟趋势
├── TopicCompare        # 多话题对比
└── StatsPanel          # 统计面板
```

### 5.2.3 BottleneckPage — 瓶颈检测

**文件**: `frontend/src/pages/BottleneckPage.tsx`

**功能：**
- [ ] 自动瓶颈检测列表
  - 按严重程度排序
  - 显示检测规则 + 详情
  - 严重程度标签（Critical/Warning/Info）
- [ ] 节点健康度评分
  - 基于延迟、消息量、错误率的综合评分
  - 红/黄/绿三色标识
- [ ] 拓扑瓶颈图
  - 在 NodeGraphPage 基础上叠加延迟热力
  - 节点大小 = 消息量
  - 连线粗细 = 延迟
  - 颜色 = 健康度
- [ ] 历史趋势
  - 瓶颈变化趋势图
  - 最近 N 次检测结果
- [ ] 建议面板
  - 针对每个瓶颈给出优化建议
  - 例如："/scan 延迟过高 → 考虑增加 throttle_rate"

**UI 组件结构：**
```
BottleneckPage
├── BottleneckList      # 检测列表（按严重程度）
│   └── BottleneckItem  # 单条检测结果
├── NodeHealthGrid      # 节点健康度评分网格
├── TopologyBottleneck  # 拓扑图 + 延迟叠加
├── HistoryTrend        # 历史趋势图
└── SuggestionPanel     # 优化建议
```

---

## 5.3 增强 NodeGraphPage

**文件**: `frontend/src/pages/NodeGraphPage.tsx`（已有，需增强）

**增强功能：**
- [ ] 实时延迟叠加显示
  - 连线颜色 = 延迟值
  - 节点颜色 = 健康度
- [ ] Trace 回放
  - 在图上高亮显示单条 trace 的路径
  - 动画演示消息流向
- [ ] 节点详情增强
  - 显示该节点的延迟统计
  - 发布/订阅话题数

---

## 5.4 AI 辅助诊断（高级）

### 5.4.1 异常检测

- [ ] 基于历史数据的异常检测
  - 延迟突然上升告警
  - 消息频率异常（突增/突降）
  - 节点断连检测
- [ ] 自动根因分析
  - 根据拓扑图追溯延迟源头
  - 识别级联延迟（上游延迟导致下游延迟）

### 5.4.2 智能建议

- [ ] 基于检测结果的优化建议
  - 话题限流建议
  - 节点拆分建议
  - QoS 配置建议
- [ ] 自然语言报告生成
  - 自动生成系统健康报告
  - 支持导出为 Markdown/PDF

---

## 开发优先级与排期

| 优先级 | 任务 | 预估工时 | 依赖 |
|--------|------|----------|------|
| **P0** | 5.1 后端 Proxy 开发 | 2-3h | 无 |
| **P0** | 5.2.1 TracePage | 2h | 5.1 |
| **P1** | 5.2.2 LatencyPage | 2h | 5.1 |
| **P1** | 5.2.3 BottleneckPage | 2-3h | 5.1 |
| **P2** | 5.3 增强 NodeGraphPage | 1-2h | 5.1 |
| **P3** | 5.4 AI 辅助诊断 | 3-4h | P0-P2 |

**总预估**: 12-16 小时

---

## 技术风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Proxy 增加延迟 | 可能影响实时性 | 使用零拷贝转发，目标延迟 <1ms |
| 内存溢出 | 高频消息堆积 | 环形缓冲区限大小，自动淘汰旧数据 |
| rosbridge 协议变化 | Proxy 解析失败 | 仅转发不解析消息体，meta 独立注入 |
| 前端性能 | 大量 trace 渲染卡顿 | 虚拟滚动 + 分页 + 限流刷新 |

---

## 验收标准

1. **Proxy** 成功拦截并记录 1000+ 条/秒的消息
2. **TracePage** 能正确显示调用链时间线，支持搜索过滤
3. **LatencyPage** 热力图实时更新，百分位统计准确
4. **BottleneckPage** 自动检测出已知瓶颈（如高频话题延迟）
5. **NodeGraphPage** 增强后能叠加延迟热力
6. **TypeScript** 编译零错误，Vite 构建成功
7. **端到端延迟** 代理增加 <5ms

---

*创建时间: 2026-04-23 09:56*  
*状态: 待审批*
