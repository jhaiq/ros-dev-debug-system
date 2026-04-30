import WebSocket from 'ws';
// 通过 Proxy (9091) 连接，验证 trace 捕获
const w = new WebSocket('ws://localhost:9091');
w.on('open', () => {
  console.log('Connected to proxy');
  w.send(JSON.stringify({ op: 'subscribe', topic: '/chatter' }));
});
let count = 0;
w.on('message', d => {
  const m = JSON.parse(d.toString());
  if (m.op === 'proxy_status') console.log('Proxy status:', m.status);
  else if (m.op === 'publish' && m.topic === '/chatter') {
    count++;
    if (count <= 3) console.log('Got /chatter:', m.msg?.data || 'no data');
  }
  if (count >= 5) { w.close(); console.log('Total:', count); process.exit(0); }
});
setTimeout(() => { w.close(); console.log('Count:', count); process.exit(count > 0 ? 0 : 1); }, 10000);
