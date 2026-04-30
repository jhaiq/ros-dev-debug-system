#!/bin/bash
SRC=/home/node/.openclaw/workspace/projects/ros-dev-debug-system/frontend/src
DEST=/home/nvidia/ros-dev-debug-system/frontend/src
cp "$SRC/hooks/useROS.tsx" "$DEST/hooks/useROS.tsx"
cp "$SRC/pages/ParamsPage.tsx" "$DEST/pages/ParamsPage.tsx"
cp "$SRC/pages/StatusPage.tsx" "$DEST/pages/StatusPage.tsx"
cp "$SRC/pages/NodesPage.tsx" "$DEST/pages/NodesPage.tsx"
cp "$SRC/pages/TopicsPage.tsx" "$DEST/pages/TopicsPage.tsx"
cp "$SRC/pages/ServicesPage.tsx" "$DEST/pages/ServicesPage.tsx"
cp "$SRC/App.tsx" "$DEST/App.tsx"
echo "SYNCED"
