/**
 * E2E 验证脚本 — ros-dev-debug-system on Jetson
 * 验证完整链路: rosbridge → proxy → API → 前端
 */
import WebSocket from 'ws';
// Node 22 has built-in fetch, no need for node-fetch

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, status: '✅' }); console.log('✅', name); }
  catch (e) { results.push({ name, status: '❌', error: e.message }); console.log('❌', name, '-', e.message); }
}

function ws(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
  });
}

function sendMsg(ws, msg) {
  return new Promise((resolve) => {
    const h = (d) => { ws.removeListener('message', h); resolve(JSON.parse(d.toString())); };
    ws.on('message', h);
    ws.send(JSON.stringify(msg));
  });
}

function subscribe(ws, topic, count = 1, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const msgs = [];
    const h = (d) => {
      const m = JSON.parse(d.toString());
      if (m.op === 'publish' && m.topic === topic) { msgs.push(m); if (msgs.length >= count) { ws.removeListener('message', h); resolve(msgs); } }
    };
    ws.on('message', h);
    ws.send(JSON.stringify({ op: 'subscribe', topic }));
    setTimeout(() => { ws.removeListener('message', h); msgs.length ? resolve(msgs) : reject(new Error('timeout')); }, timeout);
  });
}

// === Tests ===

await test('1. Rosbridge 连接 (9090)', async () => {
  const w = await ws('ws://localhost:9090'); w.close();
});

await test('2. 获取真实话题列表', async () => {
  const w = await ws('ws://localhost:9090');
  const r = await sendMsg(w, { op: 'get_topics_and_raw_types' });
  w.close();
  if (!r.topics || r.topics.length < 3) throw new Error('topics < 3');
  if (!r.topics.includes('/chatter')) throw new Error('no /chatter');
});

await test('3. 获取 ROS2 节点列表', async () => {
  const w = await ws('ws://localhost:9090');
  const r = await sendMsg(w, { op: 'get_nodes' });
  w.close();
  if (!r.nodes || r.nodes.length < 2) throw new Error('nodes < 2');
});

await test('4. 获取 rosapi/rosapi_params 节点', async () => {
  const w = await ws('ws://localhost:9090');
  const r = await sendMsg(w, { op: 'get_nodes' });
  w.close();
  const hasRosapi = r.nodes.some(n => n.includes('rosapi'));
  if (!hasRosapi) throw new Error('no rosapi node');
});

await test('5. 获取服务列表', async () => {
  const w = await ws('ws://localhost:9090');
  const r = await sendMsg(w, { op: 'get_services' });
  w.close();
  if (!r.services || r.services.length < 3) throw new Error('services < 3');
});

await test('6. 获取参数列表', async () => {
  const w = await ws('ws://localhost:9090');
  const r = await sendMsg(w, { op: 'get_param_names' });
  w.close();
  if (!r.params || r.params.length < 1) throw new Error('no params');
});

await test('7. 订阅真实 /chatter 话题 (rosbridge)', async () => {
  const w = await ws('ws://localhost:9090');
  const msgs = await subscribe(w, '/chatter', 3, 5000);
  w.close();
  if (!msgs[0].msg || !msgs[0].msg.data) throw new Error('no data in message');
  console.log('   示例:', msgs[0].msg.data);
});

await test('8. Proxy WebSocket 连接 (9091)', async () => {
  const w = await ws('ws://localhost:9091');
  w.close();
});

await test('9. Proxy 实时推送状态', async () => {
  const w = await ws('ws://localhost:9091');
  const r = await new Promise((resolve) => {
    const h = (d) => { w.removeListener('message', h); resolve(JSON.parse(d.toString())); };
    w.on('message', h);
  });
  w.close();
  if (r.op !== 'proxy_status') throw new Error('no proxy_status');
  console.log('   状态:', r.status);
});

await test('10. Proxy 捕获真实 trace 数据', async () => {
  // Subscribe via rosbridge (through proxy) to generate traces
  const w = await ws('ws://localhost:9091');
  const msgs = await subscribe(w, '/chatter', 3, 6000);
  w.close();
  if (!msgs[0].msg?.data) throw new Error('no data');
  console.log('   示例:', msgs[0].msg.data);
});

await test('11. Proxy REST API /api/traces', async () => {
  await new Promise(r => setTimeout(r, 1000)); // Wait for traces to populate
  const res = await fetch('http://localhost:9092/api/traces?limit=5');
  const data = await res.json();
  if (!data.traces || data.traces.length < 1) throw new Error('no traces: ' + JSON.stringify(data));
  console.log('   捕获', data.traces.length, '条 trace');
  console.log('   示例:', JSON.stringify(data.traces[0]).substring(0, 120));
});

await test('12. Proxy /api/traces 字段完整性', async () => {
  const res = await fetch('http://localhost:9092/api/traces?limit=1');
  const data = await res.json();
  const t = data.traces[0];
  const required = ['trace_id', 'topic', 'publish_ts', 'subscribe_ts', 'latency_ms', 'msg_size_bytes'];
  for (const f of required) {
    if (t[f] === undefined) throw new Error('missing field: ' + f);
  }
  console.log('   topic:', t.topic, 'latency:', t.latency_ms + 'ms', 'size:', t.msg_size_bytes + 'B');
});

await test('13. Proxy /api/latency 延迟统计', async () => {
  const res = await fetch('http://localhost:9092/api/latency');
  const data = await res.json();
  if (!data.stats) throw new Error('no stats');
  const keys = Object.keys(data.stats);
  if (keys.length < 1) throw new Error('no topic stats');
  console.log('   话题数:', keys.length);
  const stat = data.stats[keys[0]];
  console.log('   ' + keys[0], 'count:', stat.count, 'avg:', stat.avg?.toFixed(2) + 'ms');
});

await test('14. Proxy /api/stats 系统摘要', async () => {
  const res = await fetch('http://localhost:9092/api/stats');
  const data = await res.json();
  if (!data.trace_count && data.trace_count !== 0) throw new Error('no trace_count');
  console.log('   traces:', data.trace_count, 'topics:', data.topic_count, 'upstream:', data.upstream_connected);
});

await test('15. Proxy /api/bottlenecks 瓶颈检测', async () => {
  const res = await fetch('http://localhost:9092/api/bottlenecks');
  const data = await res.json();
  if (!data.bottlenecks) throw new Error('no bottlenecks');
  console.log('   瓶颈数:', data.count);
});

await test('16. Backend /health', async () => {
  const res = await fetch('http://localhost:4000/health');
  const data = await res.json();
  if (data.status !== 'ok') throw new Error('status != ok');
});

await test('17. Backend /api/status', async () => {
  const res = await fetch('http://localhost:4000/api/status');
  const data = await res.json();
  if (!data.name) throw new Error('no name');
  console.log('   name:', data.name, 'version:', data.version);
});

await test('18. Frontend HTML 正常服务', async () => {
  const res = await fetch('http://localhost:3000/');
  const html = await res.text();
  if (!html.includes('ROS 开发调试系统')) throw new Error('wrong page');
  if (!html.includes('main.tsx')) throw new Error('no main.tsx');
});

await test('19. 前端 Vite 资源可用', async () => {
  const res = await fetch('http://localhost:3000/src/main.tsx');
  if (res.status !== 200) throw new Error('main.tsx not served: ' + res.status);
  const code = await res.text();
  if (!code.includes('createRoot')) throw new Error('main.tsx incomplete');
});

await test('20. Proxy msg_type 映射', async () => {
  const res = await fetch('http://localhost:9092/api/traces?limit=10');
  const data = await res.json();
  const withType = data.traces.filter(t => t.msg_type && t.msg_type !== 'unknown');
  if (withType.length < 1) throw new Error('no msg_type mapped');
  console.log('   msg_type:', withType[0].msg_type);
});

await test('21. 端到端延迟质量', async () => {
  const res = await fetch('http://localhost:9092/api/traces?limit=100');
  const data = await res.json();
  if (data.traces.length < 3) throw new Error('too few traces: ' + data.traces.length);
  const lats = data.traces.map(t => t.latency_ms).filter(l => l >= 0);
  const avg = lats.reduce((a, b) => a + b, 0) / lats.length;
  const max = Math.max(...lats);
  console.log('   avg:', avg.toFixed(2) + 'ms', 'max:', max + 'ms', 'count:', lats.length);
  if (avg > 100) throw new Error('avg latency too high: ' + avg);
});

await test('22. WebSocket 实时推送 (Proxy)', async () => {
  const w = await ws('ws://localhost:9091/ws/traces');
  const msgs = await new Promise((resolve, reject) => {
    const received = [];
    const h = (d) => {
      const m = JSON.parse(d.toString());
      received.push(m);
      if (received.length >= 3) { w.close(); resolve(received); }
    };
    w.on('message', h);
    setTimeout(() => { w.close(); received.length ? resolve(received) : reject(new Error('timeout')); }, 6000);
  });
  console.log('   收到', msgs.length, '条实时推送');
});

await test('23. ROS2 真实节点数量', async () => {
  const w = await ws('ws://localhost:9090');
  const r = await sendMsg(w, { op: 'get_nodes' });
  w.close();
  if (r.nodes.length < 3) throw new Error('only ' + r.nodes.length + ' nodes');
  console.log('   节点:', r.nodes.join(', '));
});

await test('24. 服务调用 /rosapi/get_topics', async () => {
  const w = await ws('ws://localhost:9090');
  const r = await sendMsg(w, { op: 'call_service', service: '/rosapi/get_topics', id: 'test' });
  w.close();
  if (!r.result && !r.values) throw new Error('service call failed');
  console.log('   result:', r.result);
});

// === Summary ===
console.log('\n========== 验证结果汇总 ==========');
const passed = results.filter(r => r.status === '✅').length;
const failed = results.filter(r => r.status === '❌').length;
console.log(`总计: ${passed} 通过, ${failed} 失败, ${results.length} 总测试`);
if (failed > 0) {
  console.log('\n失败项:');
  results.filter(r => r.status === '❌').forEach(r => console.log('  ❌', r.name, '-', r.error));
}
process.exit(failed > 0 ? 1 : 0);
