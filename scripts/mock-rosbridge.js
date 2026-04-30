/**
 * Mock ROS Bridge Server
 * Simulates rosbridge_server for local UI testing (port 9090)
 */
import { WebSocketServer } from 'ws';

const PORT = 9090;

const TOPICS = {
  '/chatter': 'std_msgs/String',
  '/odom': 'nav_msgs/Odometry',
  '/imu': 'sensor_msgs/Imu',
  '/camera/image_raw': 'sensor_msgs/Image',
  '/camera/image_raw/compressed': 'sensor_msgs/CompressedImage',
  '/scan': 'sensor_msgs/LaserScan',
  '/points': 'sensor_msgs/PointCloud2',
  '/map': 'nav_msgs/OccupancyGrid',
  '/move_base/simple_goal': 'move_base_msgs/MoveBaseActionGoal',
  '/tf': 'tf2_msgs/TFMessage',
  '/tf_static': 'tf2_msgs/TFMessage',
  '/battery_state': 'sensor_msgs/BatteryState',
  '/clock': 'rosgraph_msgs/Clock',
  '/diagnostics': 'diagnostic_msgs/DiagnosticArray',
};

const NODES = [
  'robot_state_publisher', 'move_base', 'slam_gmapping',
  'camera_driver', 'lidar_driver', 'imu_driver',
  'odom_publisher', 'battery_monitor', 'rosapi',
  'robot_controller', 'navigation_stack', 'tf_publisher',
];

const SERVICES = [
  ['/clear_costmaps', 'std_srvs/Empty'],
  ['/get_loggers', 'roscpp/GetLoggers'],
  ['/set_logger_level', 'roscpp/SetLoggerLevel'],
  ['/move_base/make_plan', 'nav_msgs/GetPlan'],
  ['/move_base/get_costmap', 'nav_msgs/GetMap'],
  ['/static_map', 'nav_msgs/GetMap'],
  ['/set_parameters', 'rosapi/SetParam'],
  ['/get_params', 'rosapi/GetParamNames'],
  ['/service_types', 'rosapi/ServiceTypes'],
  ['/topics_and_raw_types', 'rosapi/TopicsAndRawTypes'],
];

const PARAMS = [
  '/use_sim_time', '/robot_description', '/robot_name',
  '/move_base/base_global_planner', '/move_base/base_local_planner',
  '/move_base/controller_frequency', '/move_base/recovery_behavior_enabled',
  '/odom_frame_id', '/base_frame_id', '/map_frame_id',
  '/camera/fps', '/camera/width', '/camera/height',
  '/lidar/min_range', '/lidar/max_range', '/lidar/angle_increment',
  '/battery/warn_level', '/battery/critical_level',
  '/rosdistro', '/rosversion',
  '/move_base/footprint',
];

const TF_FRAMES = [
  { parent: 'map', child: 'odom' },
  { parent: 'odom', child: 'base_link' },
  { parent: 'base_link', child: 'base_footprint' },
  { parent: 'base_link', child: 'laser_link' },
  { parent: 'base_link', child: 'camera_link' },
  { parent: 'camera_link', child: 'camera_optical_frame' },
  { parent: 'base_link', child: 'imu_link' },
  { parent: 'base_link', child: 'wheel_left_link' },
  { parent: 'base_link', child: 'wheel_right_link' },
];

const subscribers = {}; // topic -> Set<ws>

function rand(min, max) { return Math.random() * (max - min) + min; }
function seq() { return Math.floor(Math.random() * 9999); }
function stamp() {
  const t = Date.now() / 1000;
  return { secs: Math.floor(t), nsecs: Math.floor((t % 1) * 1e9) };
}

function genChatter() {
  return { data: `Hello ROS Dev Debug! count=${Math.floor(rand(1, 9999))}` };
}
function genOdom() {
  return {
    header: { seq: seq(), stamp: stamp(), frame_id: 'odom' },
    child_frame_id: 'base_link',
    pose: { pose: { position: { x: rand(-5, 5), y: rand(-5, 5), z: 0 }, orientation: { x: 0, y: 0, z: rand(-0.5, 0.5), w: rand(0.5, 1) } } },
    twist: { twist: { linear: { x: rand(-0.5, 0.5), y: 0, z: 0 }, angular: { x: 0, y: 0, z: rand(-0.3, 0.3) } } },
  };
}
function genImu() {
  return {
    header: { seq: seq(), stamp: stamp(), frame_id: 'imu_link' },
    orientation: { x: rand(-0.1, 0.1), y: rand(-0.1, 0.1), z: rand(-0.1, 0.1), w: 0.99 },
    angular_velocity: { x: rand(-0.05, 0.05), y: rand(-0.05, 0.05), z: rand(-0.05, 0.05) },
    linear_acceleration: { x: rand(9.7, 9.9), y: rand(-0.1, 0.1), z: rand(-0.1, 0.1) },
  };
}
function genLaserScan() {
  const n = 180;
  const ranges = Array.from({ length: n }, () => rand(0.5, 10));
  return {
    header: { seq: seq(), stamp: stamp(), frame_id: 'laser_link' },
    angle_min: -3.14159, angle_max: 3.14159, angle_increment: 0.0349,
    range_min: 0.1, range_max: 20, ranges,
    intensities: ranges.map(r => r * 0.1),
  };
}
function genBattery() {
  return {
    voltage: 12 + rand(-0.5, 0.5),
    current: rand(1, 5),
    charge: rand(60, 95),
    capacity: 10000,
    percentage: rand(60, 95) / 100,
    power_supply_status: 2,
    header: { frame_id: 'base_link' },
  };
}
function genTf() {
  const transforms = TF_FRAMES.map((tf, i) => ({
    header: { seq: i, stamp: stamp(), frame_id: tf.parent },
    child_frame_id: tf.child,
    transform: {
      translation: { x: rand(-0.1, 0.1) * i, y: rand(-0.1, 0.1) * i, z: 0.05 * i },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
  }));
  return { transforms };
}
function genMap() {
  return {
    header: { frame_id: 'map' },
    info: { resolution: 0.05, width: 100, height: 100, origin: { position: { x: -2.5, y: -2.5, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } } },
    data: Array.from({ length: 10000 }, () => {
      const r = Math.random();
      return r < 0.1 ? -1 : r < 0.6 ? 0 : r < 0.8 ? 50 : 100;
    }),
  };
}
function genDiagnostics() {
  return {
    header: { stamp: stamp() },
    status: [
      { level: 0, name: 'Battery', message: 'OK', hardware_id: 'bat0', values: [{ key: 'Voltage', value: '12.4V' }] },
      { level: 0, name: 'Lidar', message: 'OK', hardware_id: 'lidar0', values: [{ key: 'Range', value: '10m' }] },
      { level: 1, name: 'Camera', message: 'Warm', hardware_id: 'cam0', values: [{ key: 'Temp', value: '45°C' }] },
    ],
  };
}

const generators = {
  '/chatter': genChatter, '/odom': genOdom, '/imu': genImu,
  '/scan': genLaserScan, '/battery_state': genBattery,
  '/tf': genTf, '/tf_static': genTf, '/map': genMap,
  '/diagnostics': genDiagnostics,
};

const wss = new WebSocketServer({ port: PORT });
console.log(`[Mock Rosbridge] 🚀 ws://0.0.0.0:${PORT}`);
console.log(`[Mock Rosbridge] ${Object.keys(TOPICS).length} topics, ${NODES.length} nodes, ${SERVICES.length} services`);

function safeSend(ws, data) {
  if (ws.readyState === 1) ws.send(data);
}

wss.on('connection', (ws) => {
  console.log(`[Mock] Client connected`);

  // Start publish loop for this client
  const intervals = [];
  const startPublishing = () => {
    for (const [topic, gen] of Object.entries(generators)) {
      if (subscribers[topic]?.has(ws)) {
        const iv = setInterval(() => {
          const msg = { op: 'publish', topic, msg: gen() };
          safeSend(ws, JSON.stringify(msg));
        }, 200); // 5Hz
        intervals.push(iv);
      }
    }
  };

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.op) {
      case 'subscribe': {
        const topic = msg.topic;
        if (!subscribers[topic]) subscribers[topic] = new Set();
        subscribers[topic].add(ws);
        console.log(`  [Sub] ${topic}`);
        // Send one immediately
        if (generators[topic]) {
          safeSend(ws, JSON.stringify({ op: 'publish', topic, msg: generators[topic]() }));
        }
        // Restart intervals
        intervals.forEach(clearInterval);
        intervals.length = 0;
        startPublishing();
        break;
      }
      case 'unsubscribe': {
        const topic = msg.topic;
        subscribers[topic]?.delete(ws);
        break;
      }
      case 'call_service': {
        const service = msg.service;
        const id = msg.id;
        const found = SERVICES.some(([s]) => s === service);
        safeSend(ws, JSON.stringify({
          op: 'service_response', id, service,
          values: { status: 'ok' }, result: found,
        }));
        break;
      }
      case 'get_topics_and_raw_types':
        safeSend(ws, JSON.stringify({
          op: 'topics_and_raw_types',
          topics: Object.keys(TOPICS),
          types: Object.values(TOPICS),
        }));
        break;
      case 'get_topics':
        safeSend(ws, JSON.stringify({
          op: 'topics', topics: Object.keys(TOPICS), types: Object.values(TOPICS),
        }));
        break;
      case 'get_services':
        safeSend(ws, JSON.stringify({ op: 'services', services: SERVICES.map(([s]) => s) }));
        break;
      case 'get_service_type': {
        const stype = SERVICES.find(([s]) => s === msg.service)?.[1] || '';
        safeSend(ws, JSON.stringify({ op: 'service_response', type: stype }));
        break;
      }
      case 'get_nodes':
        safeSend(ws, JSON.stringify({ op: 'nodes', nodes: NODES }));
        break;
      case 'get_node_details':
        safeSend(ws, JSON.stringify({ op: 'node_details', node: msg.node || '', subscribing: ['/chatter'], publishing: ['/odom'], services: [] }));
        break;
      case 'get_param':
        safeSend(ws, JSON.stringify({ op: 'param', name: msg.name || '', value: true }));
        break;
      case 'get_param_names':
      case 'get_params':
        safeSend(ws, JSON.stringify({ op: 'param_names', params: PARAMS }));
        break;
      case 'set_param':
        safeSend(ws, JSON.stringify({ op: 'set_param', name: msg.name, value: msg.value }));
        break;
      case 'subscribe_log':
        safeSend(ws, JSON.stringify({ op: 'log', msg: 'Mock rosbridge running', level: 'info' }));
        break;
    }
  });

  ws.on('close', () => {
    for (const topic of Object.keys(subscribers)) {
      subscribers[topic].delete(ws);
    }
    intervals.forEach(clearInterval);
    console.log(`[Mock] Client disconnected`);
  });
});
