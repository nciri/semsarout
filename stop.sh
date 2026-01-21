#!/bin/bash

# SemsarOut Development Environment Stop Script
# =============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$PROJECT_ROOT/.dev-pids"

echo -e "${YELLOW}Stopping SemsarOut development services...${NC}"

# Kill processes from PID file
if [ -f "$PID_FILE" ]; then
    while read pid; do
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "Stopping process $pid..."
            kill "$pid" 2>/dev/null || true
        fi
    done < "$PID_FILE"
    rm -f "$PID_FILE"
fi

# Kill any remaining backend processes
pkill -f "python run.py" 2>/dev/null || true
pkill -f "flask run" 2>/dev/null || true

# Kill any remaining frontend processes
pkill -f "vite" 2>/dev/null || true

# Stop Docker services
echo -e "${YELLOW}Stopping Docker services...${NC}"
docker-compose -f "$PROJECT_ROOT/docker-compose.yml" down 2>/dev/null || true

echo -e "${GREEN}All services stopped.${NC}"
