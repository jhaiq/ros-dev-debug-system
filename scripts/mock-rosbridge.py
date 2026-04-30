#!/usr/bin/env python3
"""
Mock ROS Bridge Server — 模拟 rosbridge_server 行为
提供 rosbridge protocol v2 WebSocket 接口 (端口 9090)
用于前端/Proxy 在无真实 ROS 环境下的功能验证
"""
import asyncio
import json
import time
import random
import websockets
from collections import defaultdict

PORT = 9090

# 模拟的 ROS 话题数据
TOPICS = {
    "/chatter": "std_msgs/String",
    "/odom": "nav_msgs/Odometry",
    "/imu": "sensor_msgs/Imu",
    "/camera/image_raw": "sensor_msgs/Image",
    "/camera/image_raw/compressed": "sensor_msgs/CompressedImage",
    "/scan": "sensor_msgs/LaserScan",
    "/points": "sensor_msgs/PointCloud2",
    "/map": "nav_msgs/OccupancyGrid",
    "/move_base/simple_goal": "move_base_msgs/MoveBaseActionGoal",
    "/tf": "tf2_msgs/TFMessage",
    "/tf_static": "tf2_msgs/TFMessage",
    "/battery_state": "sensor_msgs/BatteryState",
    "/clock": "rosgraph_msgs/Clock",
    "/diagnostics": "diagnostic_msgs/DiagnosticArray",
}

NODES = [
    "robot_state_publisher",
    "move_base",
    "slam_gmapping",
    "camera_driver",
    "lidar_driver",
    "imu_driver",
    "odom_publisher",
    "battery_monitor",
    "rosapi",
    "robot_controller",
    "navigation_stack",
    "tf_publisher",
]

SERVICES = [
    ("/clear_costmaps", "std_srvs/Empty"),
    ("/get_loggers", "roscpp/GetLoggers"),
    ("/set_logger_level", "roscpp/SetLoggerLevel"),
    ("/move_base/make_plan", "nav_msgs/GetPlan"),
    ("/move_base/get_costmap", "nav_msgs/GetMap"),
    ("/static_map", "nav_msgs/GetMap"),
    ("/set_parameters", "rosapi/SetParam"),
    ("/get_params", "rosapi/GetParamNames"),
    ("/service_types", "rosapi/ServiceTypes"),
    ("/topics_and_raw_types", "rosapi/TopicsAndRawTypes"),
]

PARAMS = [
    "/use_sim_time", "/robot_description", "/robot_name",
    "/move_base/base_global_planner", "/move_base/base_local_planner",
    "/move_base/controller_frequency", "/move_base/recovery_behavior_enabled",
    "/odom_frame_id", "/base_frame_id", "/map_frame_id",
    "/camera/fps", "/camera/width", "/camera/height",
    "/lidar/min_range", "/lidar/max_range", "/lidar/angle_increment",
    "/battery/warn_level", "/battery/critical_level",
    "/rosdistro", "/rosversion",
    "/move_base/footprint",
    "/move_base/global_costmap/robot_base_frame",
    "/move_base/local_costmap/robot_base_frame",
    "/slam/transforms_publish",
    "/tf/rate",
]

# 订阅管理
subscribers = defaultdict(list)  # topic -> [ws_list]

# 模拟帧
TF_FRAMES = [
    {"parent": "map", "child": "odom"},
    {"parent": "odom", "child": "base_link"},
    {"parent": "base_link", "child": "base_footprint"},
    {"parent": "base_link", "child": "laser_link"},
    {"parent": "base_link", "child": "camera_link"},
    {"parent": "camera_link", "child": "camera_optical_frame"},
    {"parent": "base_link", "child": "imu_link"},
    {"parent": "base_link", "child": "wheel_left_link"},
    {"parent": "base_link", "child": "wheel_right_link"},
]


def make_chatter_msg():
    return {"data": f"Hello ROS Dev Debug System! count={random.randint(1,9999)}"}


def make_odom_msg():
    t = time.time()
    return {
        "header": {"seq": random.randint(0, 9999), "stamp": {"secs": int(t), "nsecs": int((t % 1) * 1e9)}, "frame_id": "odom"},
        "child_frame_id": "base_link",
        "pose": {"pose": {"position": {"x": random.uniform(-5, 5), "y": random.uniform(-5, 5), "z": 0.0},
                          "orientation": {"x": 0, "y": 0, "z": random.uniform(-0.5, 0.5), "w": random.uniform(0.5, 1.0)}}},
        "twist": {"twist": {"linear": {"x": random.uniform(-0.5, 0.5), "y": 0, "z": 0},
                            "angular": {"x": 0, "y": 0, "z": random.uniform(-0.3, 0.3)}}}
    }


def make_imu_msg():
    t = time.time()
    return {
        "header": {"seq": random.randint(0, 9999), "stamp": {"secs": int(t), "nsecs": int((t % 1) * 1e9)}, "frame_id": "imu_link"},
        "orientation": {"x": random.uniform(-0.1, 0.1), "y": random.uniform(-0.1, 0.1), "z": random.uniform(-0.1, 0.1), "w": 0.99},
        "angular_velocity": {"x": random.uniform(-0.05, 0.05), "y": random.uniform(-0.05, 0.05), "z": random.uniform(-0.05, 0.05)},
        "linear_acceleration": {"x": random.uniform(9.7, 9.9), "y": random.uniform(-0.1, 0.1), "z": random.uniform(-0.1, 0.1)},
    }


def make_laser_scan_msg():
    t = time.time()
    n = 180
    ranges = [random.uniform(0.5, 10.0) for _ in range(n)]
    return {
        "header": {"seq": random.randint(0, 9999), "stamp": {"secs": int(t), "nsecs": int((t % 1) * 1e9)}, "frame_id": "laser_link"},
        "angle_min": -3.14159, "angle_max": 3.14159, "angle_increment": 0.0349,
        "range_min": 0.1, "range_max": 20.0,
        "ranges": ranges,
        "intensities": [r * 0.1 for r in ranges],
    }


def make_battery_msg():
    return {
        "voltage": 12.0 + random.uniform(-0.5, 0.5),
        "current": random.uniform(1.0, 5.0),
        "charge": random.uniform(60, 95),
        "capacity": 10000,
        "percentage": random.uniform(60, 95) / 100.0,
        "power_supply_status": 2,
        "header": {"frame_id": "base_link"},
    }


def make_tf_msg():
    t = time.time()
    transforms = []
    for i, tf in enumerate(TF_FRAMES):
        transforms.append({
            "header": {"seq": i, "stamp": {"secs": int(t), "nsecs": int((t % 1) * 1e9)}, "frame_id": tf["parent"]},
            "child_frame_id": tf["child"],
            "transform": {
                "translation": {"x": random.uniform(-1, 1) * 0.1 * i, "y": random.uniform(-1, 1) * 0.1 * i, "z": 0.05 * i},
                "rotation": {"x": 0, "y": 0, "z": 0, "w": 1.0},
            }
        })
    return {"transforms": transforms}


def make_map_msg():
    return {
        "header": {"frame_id": "map"},
        "info": {"resolution": 0.05, "width": 100, "height": 100, "origin": {"position": {"x": -2.5, "y": -2.5, "z": 0}, "orientation": {"x": 0, "y": 0, "z": 0, "w": 1.0}}},
        "data": [random.choice([-1, 0, 0, 0, 0, 50, 100]) for _ in range(100 * 100)],
    }


TOPIC_GENERATORS = {
    "/chatter": make_chatter_msg,
    "/odom": make_odom_msg,
    "/imu": make_imu_msg,
    "/scan": make_laser_scan_msg,
    "/battery_state": make_battery_msg,
    "/tf": make_tf_msg,
    "/tf_static": make_tf_msg,
    "/map": make_map_msg,
}


async def handle_client(websocket):
    print(f"[Mock Rosbridge] 客户端连接: {websocket.remote_address}")
    connected = True

    # 启动后台任务推送订阅话题数据
    async def publish_loop():
        while connected:
            await asyncio.sleep(0.2)  # 5Hz
            for topic, subscribers_list in list(subscribers.items()):
                if topic in TOPIC_GENERATORS:
                    msg = TOPIC_GENERATORS[topic]()
                    data = json.dumps({"op": "publish", "topic": topic, "msg": msg})
                    for ws in subscribers_list:
                        try:
                            await ws.send(data)
                        except Exception:
                            pass

    pub_task = asyncio.create_task(publish_loop())

    try:
        async for raw_message in websocket:
            try:
                msg = json.loads(raw_message)
                op = msg.get("op", "")

                if op == "subscribe":
                    topic = msg.get("topic", "")
                    subscribers[topic].append(websocket)
                    print(f"  [Sub] {topic}")
                    # 立即发一条数据
                    if topic in TOPIC_GENERATORS:
                        data = json.dumps({"op": "publish", "topic": topic, "msg": TOPIC_GENERATORS[topic]()})
                        await websocket.send(data)

                elif op == "unsubscribe":
                    topic = msg.get("topic", "")
                    if websocket in subscribers[topic]:
                        subscribers[topic].remove(websocket)
                    print(f"  [Unsub] {topic}")

                elif op == "call_service":
                    service = msg.get("service", "")
                    service_id = msg.get("id", "")
                    found = False
                    for s, t in SERVICES:
                        if s == service:
                            found = True
                            break
                    if found:
                        response = {"op": "service_response", "id": service_id, "service": service, "values": {"status": "ok"}, "result": True}
                    else:
                        response = {"op": "service_response", "id": service_id, "service": service, "values": {}, "result": False}
                    await websocket.send(json.dumps(response))

                elif op == "get_topics":
                    resp = {"op": "topics", "topics": list(TOPICS.keys()), "types": list(TOPICS.values())}
                    await websocket.send(json.dumps(resp))

                elif op == "get_topics_and_raw_types":
                    resp = {"op": "topics_and_raw_types", "topics": list(TOPICS.keys()), "types": list(TOPICS.values())}
                    await websocket.send(json.dumps(resp))

                elif op == "get_services":
                    resp = {"op": "services", "services": [s for s, t in SERVICES]}
                    await websocket.send(json.dumps(resp))

                elif op == "get_service_type":
                    service = msg.get("service", "")
                    stype = ""
                    for s, t in SERVICES:
                        if s == service:
                            stype = t
                            break
                    resp = {"op": "service_response", "type": stype}
                    await websocket.send(json.dumps(resp))

                elif op == "get_params":
                    resp = {"op": "params", "params": PARAMS}
                    await websocket.send(json.dumps(resp))

                elif op == "get_param":
                    resp = {"op": "param", "name": msg.get("name", ""), "value": True}
                    await websocket.send(json.dumps(resp))

                elif op == "set_param":
                    resp = {"op": "set_param", "name": msg.get("name", ""), "value": msg.get("value", None)}
                    await websocket.send(json.dumps(resp))

                elif op == "get_nodes":
                    resp = {"op": "nodes", "nodes": NODES}
                    await websocket.send(json.dumps(resp))

                elif op == "get_node_details":
                    resp = {"op": "node_details", "node": msg.get("node", ""), "subscribing": ["/chatter"], "publishing": ["/odom"], "services": []}
                    await websocket.send(json.dumps(resp))

                elif op == "get_topic_details":
                    resp = {"op": "topic_details", "type": TOPICS.get(msg.get("topic", ""), ""), "subscribers": 1, "publishers": 1}
                    await websocket.send(json.dumps(resp))

                elif op == "get_service_details":
                    resp = {"op": "service_details", "type": "std_srvs/Empty", "nodes": ["move_base"]}
                    await websocket.send(json.dumps(resp))

                elif op == "get_rosapi_nodes":
                    resp = {"op": "nodes", "nodes": NODES}
                    await websocket.send(json.dumps(resp))

                elif op == "subscribe_log":
                    resp = {"op": "log", "msg": "Mock rosbridge server running", "level": "info"}
                    await websocket.send(json.dumps(resp))

                elif op == "unsubscribe_log":
                    pass

                elif op == "publish":
                    pass  # 模拟服务器不处理 publish

                else:
                    pass

            except json.JSONDecodeError:
                pass

    except websockets.ConnectionClosed:
        pass
    finally:
        connected = False
        pub_task.cancel()
        for topic in list(subscribers.keys()):
            if websocket in subscribers[topic]:
                subscribers[topic].remove(websocket)
        print(f"[Mock Rosbridge] 客户端断开: {websocket.remote_address}")


async def main():
    print(f"[Mock Rosbridge] 🚀 启动在 ws://0.0.0.0:{PORT}")
    print(f"[Mock Rosbridge] 模拟 {len(TOPICS)} 个话题, {len(NODES)} 个节点, {len(SERVICES)} 个服务")
    async with websockets.serve(handle_client, "0.0.0.0", PORT):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Mock Rosbridge] 关闭")
