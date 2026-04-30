#!/bin/bash
source /opt/ros/humble/setup.bash

echo "=== Killing ALL ros-related processes ==="
killall -9 rosbridge_websocket rosapi_node rosapi_params 2>/dev/null
sleep 3

echo "=== Force kill any remaining ==="
for pid in $(pgrep -f "ros2.*rosbridge\|ros2.*rosapi"); do
    kill -9 $pid 2>/dev/null
done
sleep 2

echo "=== Verifying all killed ==="
if pgrep -f rosbridge > /dev/null; then
    echo "WARNING: rosbridge still running"
    killall -9 rosbridge_websocket
    sleep 2
else
    echo "rosbridge: killed"
fi

if pgrep -f rosapi > /dev/null; then
    echo "WARNING: rosapi still running"
    killall -9 rosapi_node rosapi_params
    sleep 2
else
    echo "rosapi: killed"
fi

echo "=== Starting rosbridge with params_timeout=30 ==="
nohup ros2 launch rosbridge_server rosbridge_websocket_launch.xml params_timeout:=30.0 > /tmp/rosbridge_new.log 2>&1 &
echo "Launch PID: $!"

sleep 10

echo "=== Verifying nodes ==="
ros2 node list 2>&1

echo "=== Test rosapi/nodes ==="
timeout 10 ros2 service call /rosapi/nodes rosapi_msgs/srv/Nodes '{}' 2>&1 | head -5

echo "=== Done ==="
