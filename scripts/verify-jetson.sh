#!/bin/bash
# ros-dev-debug-system Jetson 验证脚本
# 在宿主机上运行: bash verify-jetson.sh

JETSON_USER="nvidia"
JETSON_HOST="172.21.0.1"
JETSON_PORT="2222"

echo "=========================================="
echo "  ROS 开发调试系统 - Jetson 环境验证"
echo "=========================================="
echo ""

# SSH 连接函数
run_cmd() {
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no -p $JETSON_PORT $JETSON_USER@$JETSON_HOST "$1"
}

echo ">>> 测试 SSH 连接..."
if run_cmd "echo '✅ SSH 连接成功'"; then
    echo ""
    
    echo ">>> 系统信息:"
    run_cmd "hostname && uname -a"
    echo ""
    
    echo ">>> ROS2 环境:"
    run_cmd "
        if command -v ros2 &> /dev/null; then
            echo '✅ ROS2 已安装'
            ros2 --version 2>/dev/null || echo 'ros2 --version 不可用'
            echo ''
            echo '--- ROS2 Nodes ---'
            timeout 5 ros2 node list 2>/dev/null || echo '(无法获取节点列表)'
            echo ''
            echo '--- ROS2 Topics ---'
            timeout 5 ros2 topic list 2>/dev/null | head -20 || echo '(无法获取话题列表)'
            echo ''
            echo '--- ROS2 Services ---'
            timeout 5 ros2 service list 2>/dev/null | head -10 || echo '(无法获取服务列表)'
        else
            echo '❌ ROS2 未安装或不在 PATH 中'
            echo '  尝试 source setup.bash...'
            source /opt/ros/humble/setup.bash 2>/dev/null && ros2 --version || echo '  仍未找到 ros2'
        fi
    "
    echo ""
    
    echo ">>> rosbridge_suite 状态:"
    run_cmd "
        if ros2 node list 2>/dev/null | grep -q rosbridge; then
            echo '✅ rosbridge 节点正在运行'
        else
            echo '⚠️  rosbridge 节点未运行'
            echo '  启动命令: ros2 launch rosbridge_server rosbridge_websocket_launch.xml'
        fi
    "
    echo ""
    
    echo ">>> Docker 状态:"
    run_cmd "
        if command -v docker &> /dev/null; then
            echo '✅ Docker 已安装'
            docker --version
            echo ''
            echo '--- Running containers ---'
            docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null | head -10
            echo ''
            echo '--- ROS-related containers ---'
            docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null | grep -i ros || echo '(无 ROS 相关容器)'
        else
            echo '❌ Docker 未安装'
        fi
    "
    echo ""
    
    echo ">>> ros-dev-debug-system 项目:"
    run_cmd "
        if [ -d ~/ros-dev-debug-system ]; then
            echo '✅ 项目目录存在'
            cd ~/ros-dev-debug-system
            git log --oneline -3 2>/dev/null
            echo ''
            if [ -d frontend/dist ]; then
                echo '✅ 前端已构建'
                ls -lh frontend/dist/index.html 2>/dev/null
            else
                echo '⚠️  前端未构建'
            fi
        else
            echo '⚠️  项目目录 ~/ros-dev-debug-system 不存在'
            echo '  克隆: git clone https://github.com/jhaiq/ros-dev-debug-system.git'
        fi
    "
    echo ""
    
    echo ">>> 端口占用 (9090 rosbridge):"
    run_cmd "
        ss -tlnp 2>/dev/null | grep 9090 || netstat -tlnp 2>/dev/null | grep 9090 || echo '端口 9090 未监听'
    "
    echo ""
    
    echo "=========================================="
    echo "  验证完成"
    echo "=========================================="
else
    echo "❌ SSH 连接失败"
    echo "   请检查:"
    echo "   1. Jetson 是否开机"
    echo "   2. SSH 端口是否为 $JETSON_PORT"
    echo "   3. SSH key 是否已添加到 authorized_keys"
    echo "   4. 网络是否可达 (ping $JETSON_HOST)"
fi
