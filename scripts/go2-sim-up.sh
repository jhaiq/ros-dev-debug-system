#!/bin/bash
# go2_gz_sim + rosbridge 一键启动脚本（端到端验证用）
# 用法: bash scripts/go2-sim-up.sh [--sensors]
# 依赖: ~/work/go2_gz_sim 工作空间已 colcon build；ROS 2 Jazzy
set -e

export PATH="/opt/ros/jazzy/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
source /opt/ros/jazzy/setup.bash

WS=${GO2_WS:-$HOME/work/go2_gz_sim}
source "$WS/install/setup.bash"
export CYCLONEDDS_URI="file://$WS/src/docker/cyclonedds.xml"

SENSOR_ARGS=""
if [ "$1" = "--sensors" ]; then
  SENSOR_ARGS="sensors:=true"
fi

mkdir -p /tmp/go2-e2e

echo ">>> 启动 Gazebo 仿真 (日志: /tmp/go2-e2e/sim.log)"
# world 用 empty.world：默认 rmuc_2025 场地依赖外部模型，empty 自包含
nohup ros2 launch gazebo_sim launch.py $SENSOR_ARGS world:=empty.world > /tmp/go2-e2e/sim.log 2>&1 &
SIM_PID=$!
echo "    sim pid=$SIM_PID"

echo ">>> 等待 /clock 出现（仿真就绪，首次可能需下载模型资源）..."
for i in $(seq 1 60); do
  if ros2 topic list 2>/dev/null | grep -q "/clock"; then
    echo "    仿真就绪 (等待 $((i*5))s)"
    break
  fi
  if ! kill -0 $SIM_PID 2>/dev/null; then
    echo "    仿真进程退出！日志尾部:"
    tail -20 /tmp/go2-e2e/sim.log
    exit 1
  fi
  sleep 5
done

echo ">>> 启动 rosbridge_server (日志: /tmp/go2-e2e/rosbridge.log)"
nohup ros2 launch rosbridge_server rosbridge_websocket_launch.xml > /tmp/go2-e2e/rosbridge.log 2>&1 &
echo "    rosbridge pid=$!"

echo ">>> 等待 rosbridge 9090 端口..."
for i in $(seq 1 20); do
  if (exec 3<>/dev/tcp/127.0.0.1/9090) 2>/dev/null; then
    exec 3>&- 3<&- 2>/dev/null || true
    echo "    rosbridge 就绪 ws://localhost:9090"
    break
  fi
  sleep 1
done

echo ">>> 话题概览:"
timeout 5 ros2 topic list 2>/dev/null | head -30 || true
echo "完成。停止仿真: pkill -f 'ros2 launch gazebo_sim'; pkill -f rosbridge"
