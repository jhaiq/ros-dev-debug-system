#!/bin/bash
# E2E 验证用 backend 启动脚本（带 ROS 环境，端口 4100 避开常用 4000）
set -e
export PATH="$HOME/.nvm/versions/node/v24.1.0/bin:/opt/ros/jazzy/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
source /opt/ros/jazzy/setup.bash
WS=${GO2_WS:-$HOME/work/go2_gz_sim}
[ -f "$WS/install/setup.bash" ] && source "$WS/install/setup.bash"
export CYCLONEDDS_URI="file://$WS/src/docker/cyclonedds.xml"
export PORT=4100
export BAG_DIR=/tmp/go2-e2e/rosbags
mkdir -p "$BAG_DIR"
cd "$(dirname "$0")/../backend"
exec node src/index.js
