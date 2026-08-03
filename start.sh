#!/bin/bash

# SemsarOut Development Environment Startup Script
# ================================================
# This script starts all services needed for development:
# - Docker services (Redis, optionally Mailhog)
# - Flask backend API
# - Vite frontend dev server

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Project root directory
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# PID file for cleanup
PID_FILE="$PROJECT_ROOT/.dev-pids"

# Ports
BACKEND_PORT=${BACKEND_PORT:-7000}
FRONTEND_PORT=${FRONTEND_PORT:-5173}

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Shutting down services...${NC}"

    # Kill background processes
    if [ -f "$PID_FILE" ]; then
        while read pid; do
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null || true
            fi
        done < "$PID_FILE"
        rm -f "$PID_FILE"
    fi

    # Stop Docker services
    echo -e "${BLUE}Stopping Docker services...${NC}"
    docker-compose -f "$PROJECT_ROOT/docker-compose.yml" down 2>/dev/null || true

    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
}

# Trap SIGINT (Ctrl+C) and SIGTERM
trap cleanup SIGINT SIGTERM

# Print banner
print_banner() {
    echo -e "${CYAN}"
    echo "  ____                               ___        _   "
    echo " / ___|  ___ _ __ ___  ___  __ _ _ _/ _ \ _   _| |_ "
    echo " \___ \ / _ \ '_ \` _ \/ __|/ _\` | '_| | | | | | | __|"
    echo "  ___) |  __/ | | | | \__ \ (_| | | | |_| | |_| | |_ "
    echo " |____/ \___|_| |_| |_|___/\__,_|_|  \___/ \__,_|\__|"
    echo -e "${NC}"
    echo -e "${GREEN}Development Environment${NC}"
    echo ""
}

# Check dependencies
check_dependencies() {
    echo -e "${BLUE}Checking dependencies...${NC}"

    # Check Docker
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: Docker is not installed${NC}"
        exit 1
    fi

    # Check docker-compose
    if ! command -v docker-compose &> /dev/null; then
        echo -e "${RED}Error: docker-compose is not installed${NC}"
        exit 1
    fi

    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}Error: Node.js is not installed${NC}"
        exit 1
    fi

    # Check Python
    if ! command -v python3 &> /dev/null; then
        echo -e "${RED}Error: Python 3 is not installed${NC}"
        exit 1
    fi

    echo -e "${GREEN}All dependencies found.${NC}"
}

# Start Docker services
start_docker_services() {
    echo -e "${BLUE}Starting Docker services (Redis)...${NC}"

    cd "$PROJECT_ROOT"

    # Start Redis (and optionally other services)
    if [ "$DEBUG_MODE" = "true" ]; then
        docker-compose --profile debug up -d
    else
        docker-compose up -d
    fi

    # Wait for Redis to be ready
    echo -e "${YELLOW}Waiting for Redis to be ready...${NC}"
    for i in {1..30}; do
        if docker-compose exec -T redis redis-cli ping &> /dev/null; then
            echo -e "${GREEN}Redis is ready.${NC}"
            break
        fi
        sleep 1
    done
}

# Setup backend virtual environment if needed
setup_backend_venv() {
    if [ ! -d "$BACKEND_DIR/venv" ]; then
        echo -e "${BLUE}Creating Python virtual environment...${NC}"
        cd "$BACKEND_DIR"
        python3 -m venv venv
        source venv/bin/activate
        pip install --upgrade pip
        pip install -r requirements.txt
    fi
}

# Start Flask backend
start_backend() {
    echo -e "${BLUE}Starting Flask backend on port $BACKEND_PORT...${NC}"

    cd "$BACKEND_DIR"

    # Check if .env exists
    if [ ! -f ".env" ]; then
        echo -e "${YELLOW}Warning: .env file not found. Copying from .env.example${NC}"
        cp .env.example .env
    fi

    # Activate virtual environment
    if [ -f "venv/bin/activate" ]; then
        source venv/bin/activate
    else
        echo -e "${RED}Error: Virtual environment not found. Run: python3 -m venv venv${NC}"
        exit 1
    fi

    # Install dependencies if needed
    pip install -r requirements.txt -q

    # Run database migrations
    echo -e "${YELLOW}Running database migrations...${NC}"
    flask db upgrade 2>/dev/null || echo -e "${YELLOW}Migrations skipped or already up to date${NC}"

    # Start Flask in background
    PORT=$BACKEND_PORT python run.py &
    BACKEND_PID=$!
    echo "$BACKEND_PID" >> "$PID_FILE"

    echo -e "${GREEN}Backend started (PID: $BACKEND_PID)${NC}"
}

# Start frontend dev server
start_frontend() {
    echo -e "${BLUE}Starting Vite frontend on port $FRONTEND_PORT...${NC}"

    cd "$FRONTEND_DIR"

    # Install dependencies if node_modules doesn't exist
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Installing frontend dependencies...${NC}"
        npm install
    fi

    # Start Vite in background
    npm run dev -- --port $FRONTEND_PORT &
    FRONTEND_PID=$!
    echo "$FRONTEND_PID" >> "$PID_FILE"

    echo -e "${GREEN}Frontend started (PID: $FRONTEND_PID)${NC}"
}

# Print service URLs
print_urls() {
    echo ""
    echo -e "${CYAN}=====================================${NC}"
    echo -e "${GREEN}Services are running!${NC}"
    echo -e "${CYAN}=====================================${NC}"
    echo ""
    echo -e "  ${BLUE}Frontend:${NC}   http://localhost:$FRONTEND_PORT"
    echo -e "  ${BLUE}Backend:${NC}    http://localhost:$BACKEND_PORT"
    echo -e "  ${BLUE}API Docs:${NC}   http://localhost:$BACKEND_PORT/api/v1"
    echo ""
    if [ "$DEBUG_MODE" = "true" ]; then
        echo -e "  ${YELLOW}Debug Services:${NC}"
        echo -e "  ${BLUE}Mailhog:${NC}    http://localhost:8025"
        echo -e "  ${BLUE}Redis UI:${NC}  http://localhost:8081"
        echo ""
    fi
    echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
    echo ""
}

# Main function
main() {
    print_banner

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --debug)
                DEBUG_MODE=true
                shift
                ;;
            --backend-only)
                BACKEND_ONLY=true
                shift
                ;;
            --frontend-only)
                FRONTEND_ONLY=true
                shift
                ;;
            --skip-docker)
                SKIP_DOCKER=true
                shift
                ;;
            --help|-h)
                echo "Usage: ./start.sh [options]"
                echo ""
                echo "Options:"
                echo "  --debug          Start with debug services (Mailhog, Redis Commander)"
                echo "  --backend-only   Only start the backend"
                echo "  --frontend-only  Only start the frontend"
                echo "  --skip-docker    Skip starting Docker services"
                echo "  --help, -h       Show this help message"
                echo ""
                echo "Environment variables:"
                echo "  BACKEND_PORT     Backend port (default: 7000)"
                echo "  FRONTEND_PORT    Frontend port (default: 5173)"
                exit 0
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                exit 1
                ;;
        esac
    done

    # Clear old PID file
    rm -f "$PID_FILE"

    check_dependencies

    # Start services based on flags
    if [ "$SKIP_DOCKER" != "true" ]; then
        start_docker_services
    fi

    setup_backend_venv

    if [ "$FRONTEND_ONLY" != "true" ]; then
        start_backend
    fi

    if [ "$BACKEND_ONLY" != "true" ]; then
        start_frontend
    fi

    print_urls

    # Wait for background processes
    wait
}

# Run main function
main "$@"
