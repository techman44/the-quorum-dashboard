#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# The Quorum -- Install Script
# Checks prerequisites, sets up the database, Python venv, and cron jobs.
# Safe to run multiple times (idempotent).
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# ── Colour helpers ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No colour

info()    { printf "${BLUE}[INFO]${NC}  %s\n" "$*"; }
success() { printf "${GREEN}[OK]${NC}    %s\n" "$*"; }
warn()    { printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
error()   { printf "${RED}[ERROR]${NC} %s\n" "$*"; }
header()  { printf "\n${BOLD}${CYAN}── %s${NC}\n" "$*"; }

# ── Trap: print a helpful message on unexpected failure ────────────────────
cleanup() {
    if [ $? -ne 0 ]; then
        echo ""
        error "Installation did not complete successfully."
        error "Review the output above for details, fix the issue, and re-run this script."
    fi
}
trap cleanup EXIT

# ── Helper: ask yes/no ─────────────────────────────────────────────────────
confirm() {
    local prompt="${1:-Continue?}"
    local default="${2:-y}"
    if [ "$default" = "y" ]; then
        read -rp "$(printf "${BOLD}%s [Y/n]: ${NC}" "$prompt")" answer
        answer="${answer:-y}"
    else
        read -rp "$(printf "${BOLD}%s [y/N]: ${NC}" "$prompt")" answer
        answer="${answer:-n}"
    fi
    [[ "$answer" =~ ^[Yy] ]]
}

# ═══════════════════════════════════════════════════════════════════════════
header "The Quorum -- Installation"
# ═══════════════════════════════════════════════════════════════════════════

echo ""
info "Project directory: $PROJECT_DIR"
echo ""

# ── 1. Check prerequisites ─────────────────────────────────────────────────
header "Checking prerequisites"

MISSING=()

# Python 3
if command -v python3 &>/dev/null; then
    PY_VERSION="$(python3 --version 2>&1)"
    success "python3 found ($PY_VERSION)"
else
    MISSING+=("python3")
    error "python3 not found"
fi

# pip (via python3 -m pip)
if python3 -m pip --version &>/dev/null 2>&1; then
    success "pip found ($(python3 -m pip --version 2>&1 | head -1))"
else
    MISSING+=("pip")
    error "pip not found (try: python3 -m ensurepip --upgrade)"
fi

# psql or docker -- at least one is required
HAS_PSQL=false
HAS_DOCKER=false

if command -v psql &>/dev/null; then
    HAS_PSQL=true
    success "psql found ($(psql --version 2>&1 | head -1))"
fi
if command -v docker &>/dev/null; then
    HAS_DOCKER=true
    success "docker found ($(docker --version 2>&1 | head -1))"
fi

# curl (needed for Ollama health checks)
if command -v curl &>/dev/null; then
    success "curl found"
else
    MISSING+=("curl")
    error "curl not found. Install curl to continue."
fi

if ! $HAS_PSQL && ! $HAS_DOCKER; then
    MISSING+=("psql or docker")
    error "Neither psql nor docker found. Install PostgreSQL or Docker to continue."
fi

if [ ${#MISSING[@]} -gt 0 ]; then
    echo ""
    error "Missing prerequisites: ${MISSING[*]}"
    error "Install the missing tools and re-run this script."
    exit 1
fi

# ── 2. Database setup ──────────────────────────────────────────────────────
header "Database setup"

USE_DOCKER="n"
if $HAS_DOCKER; then
    echo ""
    echo "How do you want to run PostgreSQL?"
    echo "  1) Docker (recommended -- uses docker-compose with pgvector)"
    echo "  2) Existing PostgreSQL instance"
    echo ""
    read -rp "$(printf "${BOLD}Choose [1/2]: ${NC}")" db_choice
    db_choice="${db_choice:-1}"

    if [ "$db_choice" = "1" ]; then
        USE_DOCKER="y"
    fi
else
    info "Docker not found; will use your existing PostgreSQL instance."
fi

if [ "$USE_DOCKER" = "y" ]; then
    info "Starting PostgreSQL + Ollama via docker-compose..."

    # Make sure .env exists before docker-compose reads it
    if [ ! -f "$PROJECT_DIR/.env" ]; then
        EARLY_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
        sed "s/GENERATE_ON_INSTALL/$EARLY_PASSWORD/" "$PROJECT_DIR/.env.example" > "$PROJECT_DIR/.env"
        DB_PASSWORD="$EARLY_PASSWORD"
        CUSTOM_DB_VARS=true
        success "Created .env with generated DB password."
    fi

    # Prefer 'docker compose' (v2) but fall back to 'docker-compose' (v1)
    if docker compose version &>/dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
    elif command -v docker-compose &>/dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        error "docker-compose not found. Install the Docker Compose plugin."
        exit 1
    fi

    (cd "$PROJECT_DIR" && $COMPOSE_CMD up -d)
    success "Docker containers started (PostgreSQL + Ollama)."

    # ── Wait for PostgreSQL ──────────────────────────────────────────
    info "Waiting for PostgreSQL to accept connections..."
    PG_MAX_WAIT=30
    PG_READY=false
    for i in $(seq 1 "$PG_MAX_WAIT"); do
        if docker exec quorum-db pg_isready -U "${DB_USER:-quorum}" -q 2>/dev/null; then
            PG_READY=true
            break
        fi
        printf "."
        sleep 1
    done
    echo ""

    if [ "$PG_READY" = true ]; then
        success "PostgreSQL is ready (took ~${i}s)."
    else
        error "PostgreSQL did not become ready within ${PG_MAX_WAIT}s."
        error "Check container logs: docker logs quorum-db"
        exit 1
    fi

    # ── Wait for Ollama ──────────────────────────────────────────────
    info "Waiting for Ollama to respond..."
    OLLAMA_MAX_WAIT=30
    OLLAMA_READY=false
    OLLAMA_URL="${OLLAMA_HOST:-http://localhost:11434}"
    for i in $(seq 1 "$OLLAMA_MAX_WAIT"); do
        if curl -s "${OLLAMA_URL}/api/tags" >/dev/null 2>&1; then
            OLLAMA_READY=true
            break
        fi
        printf "."
        sleep 1
    done
    echo ""

    if [ "$OLLAMA_READY" = true ]; then
        success "Ollama is ready (took ~${i}s)."
    else
        error "Ollama did not become ready within ${OLLAMA_MAX_WAIT}s."
        error "Check container logs: docker logs quorum-ollama"
        exit 1
    fi

    # ── Pull embedding model ─────────────────────────────────────────
    OLLAMA_EMBED_MODEL="${OLLAMA_EMBED_MODEL:-mxbai-embed-large}"
    if docker exec quorum-ollama ollama list 2>/dev/null | grep -q "$OLLAMA_EMBED_MODEL"; then
        success "$OLLAMA_EMBED_MODEL is already available."
    else
        info "Pulling $OLLAMA_EMBED_MODEL (this may take a few minutes on first run)..."
        docker exec quorum-ollama ollama pull "$OLLAMA_EMBED_MODEL"
        success "$OLLAMA_EMBED_MODEL model pulled."
    fi

    # ── Pull LLM model ────────────────────────────────────────────
    LLM_MODEL="${LLM_MODEL:-llama3.2}"
    if docker exec quorum-ollama ollama list 2>/dev/null | grep -q "$LLM_MODEL"; then
        success "$LLM_MODEL LLM model is already available."
    else
        info "Pulling $LLM_MODEL LLM model (this may take a few minutes on first run)..."
        docker exec quorum-ollama ollama pull "$LLM_MODEL"
        success "$LLM_MODEL LLM model pulled."
    fi
else
    echo ""
    info "Enter your existing PostgreSQL connection details."
    info "Press Enter to accept the default shown in [brackets]."
    echo ""

    read -rp "  DB host [localhost]: " input_host
    read -rp "  DB port [5432]: "      input_port
    read -rp "  DB user [quorum]: "    input_user
    GENERATED_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
    read -rsp "  DB password [auto-generated]: " input_pass
    echo ""
    read -rp "  DB name [quorum]: "    input_name

    DB_HOST="${input_host:-localhost}"
    DB_PORT="${input_port:-5432}"
    DB_USER="${input_user:-quorum}"
    DB_PASSWORD="${input_pass:-$GENERATED_PASSWORD}"
    DB_NAME="${input_name:-quorum}"

    # We will write these into .env in the next step if the file does not exist.
    CUSTOM_DB_VARS=true
fi

# ── 3. Environment file ───────────────────────────────────────────────────
header "Environment configuration"

if [ -f "$PROJECT_DIR/.env" ]; then
    success ".env already exists -- skipping copy."
else
    # Generate a password if one wasn't set interactively
    if [ -z "${DB_PASSWORD:-}" ]; then
        GENERATED_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"
        DB_PASSWORD="$GENERATED_PASSWORD"
        CUSTOM_DB_VARS=true
    fi
    sed "s/GENERATE_ON_INSTALL/$DB_PASSWORD/" "$PROJECT_DIR/.env.example" > "$PROJECT_DIR/.env"
    success "Created .env with generated DB password."
fi

# Patch in custom DB vars if the user entered them manually
if [ "${CUSTOM_DB_VARS:-false}" = "true" ]; then
    # Use portable sed that works on both macOS and Linux
    _sed_inplace() {
        if sed --version 2>/dev/null | grep -q GNU; then
            sed -i "$@"
        else
            sed -i '' "$@"
        fi
    }
    _sed_inplace "s|^DB_HOST=.*|DB_HOST=${DB_HOST}|"         "$PROJECT_DIR/.env"
    _sed_inplace "s|^DB_PORT=.*|DB_PORT=${DB_PORT}|"         "$PROJECT_DIR/.env"
    _sed_inplace "s|^DB_USER=.*|DB_USER=${DB_USER}|"         "$PROJECT_DIR/.env"
    _sed_inplace "s|^DB_PASSWORD=.*|DB_PASSWORD=${DB_PASSWORD}|" "$PROJECT_DIR/.env"
    _sed_inplace "s|^DB_NAME=.*|DB_NAME=${DB_NAME}|"         "$PROJECT_DIR/.env"
    success "Database credentials written to .env."
fi

warn "Review $PROJECT_DIR/.env and set your LLM / embedding provider keys."

# ── 4. Python virtual environment ─────────────────────────────────────────
header "Python virtual environment"

VENV_DIR="$PROJECT_DIR/.venv"
if [ -d "$VENV_DIR" ]; then
    success "Virtual environment already exists at .venv/"
else
    info "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
    success "Virtual environment created at .venv/"
fi

info "Installing Python dependencies..."
"$VENV_DIR/bin/pip" install --upgrade pip --quiet
"$VENV_DIR/bin/pip" install -r "$PROJECT_DIR/requirements.txt" --quiet
success "Python dependencies installed."

# ── 5. Create logs directory ───────────────────────────────────────────────
mkdir -p "$PROJECT_DIR/logs"
success "logs/ directory ready."

# ── 6. Run schema migrations ──────────────────────────────────────────────
header "Database migrations"

# Source .env so the migrate script picks up the correct vars
set -a
# shellcheck disable=SC1091
source "$PROJECT_DIR/.env"
set +a

if $HAS_PSQL; then
    info "Running schema migrations..."
    chmod +x "$SCRIPT_DIR/migrate.sh"
    "$SCRIPT_DIR/migrate.sh"
    success "Schema migrations applied."
else
    warn "psql not found locally -- skipping migrations."
    if [ "$USE_DOCKER" = "y" ]; then
        info "The Docker container automatically applies schema files on first start"
        info "(they are mounted into /docker-entrypoint-initdb.d)."
    else
        warn "You will need to run scripts/migrate.sh manually once psql is available."
    fi
fi

# ── 7. Cron jobs ──────────────────────────────────────────────────────────
header "Cron schedule"

echo ""
if confirm "Set up cron jobs for the agents?" "y"; then
    chmod +x "$SCRIPT_DIR/setup_cron.sh"
    "$SCRIPT_DIR/setup_cron.sh"
else
    info "Skipping cron setup. You can run scripts/setup_cron.sh later."
fi

# ── Final health check ────────────────────────────────────────────────────
header "Final health check"

HEALTH_OK=true

if [ "$USE_DOCKER" = "y" ]; then
    # Check PostgreSQL
    if docker exec quorum-db pg_isready -U "${DB_USER:-quorum}" -q 2>/dev/null; then
        success "PostgreSQL is responding."
    else
        error "PostgreSQL is NOT responding."
        HEALTH_OK=false
    fi

    # Check Ollama
    OLLAMA_URL="${OLLAMA_HOST:-http://localhost:11434}"
    if curl -s "${OLLAMA_URL}/api/tags" >/dev/null 2>&1; then
        success "Ollama is responding."
    else
        error "Ollama is NOT responding."
        HEALTH_OK=false
    fi

    # Check embedding model
    OLLAMA_EMBED_MODEL="${OLLAMA_EMBED_MODEL:-mxbai-embed-large}"
    if docker exec quorum-ollama ollama list 2>/dev/null | grep -q "$OLLAMA_EMBED_MODEL"; then
        success "$OLLAMA_EMBED_MODEL model is available."
    else
        error "$OLLAMA_EMBED_MODEL model is NOT available."
        HEALTH_OK=false
    fi
else
    info "Skipping Docker health checks (using external PostgreSQL)."
    info "Make sure Ollama is running and the embedding model is pulled."
fi

# ── 9. Onboarding questionnaire ──────────────────────────────────────────
header "Onboarding"

echo ""
if [ "$HEALTH_OK" = true ]; then
    info "The Quorum includes an onboarding questionnaire that helps the"
    info "agents understand you from day one. It takes about 5-10 minutes."
    echo ""
    if confirm "Would you like to run the initial onboarding questionnaire now?" "y"; then
        echo ""
        "$VENV_DIR/bin/python" -m agents.onboarding
    else
        info "Skipping onboarding. You can run it later with:"
        echo "  cd ${PROJECT_DIR} && .venv/bin/python -m agents.onboarding"
    fi
else
    warn "Skipping onboarding (health check had errors)."
    info "Once services are healthy, run onboarding with:"
    echo "  cd ${PROJECT_DIR} && .venv/bin/python -m agents.onboarding"
fi

# ── Done ──────────────────────────────────────────────────────────────────
header "Installation complete"

if [ "$HEALTH_OK" = true ]; then
    echo ""
    success "The Quorum is ready."
    echo ""
    info "Next steps:"
    echo "  1. Edit ${PROJECT_DIR}/.env with your LLM and embedding provider keys."
    echo "  2. Test an agent manually:"
    echo "     cd ${PROJECT_DIR} && .venv/bin/python -m agents.connector"
    echo "  3. Check logs in ${PROJECT_DIR}/logs/"
    echo ""
    info "Documentation: ${PROJECT_DIR}/docs/deployment.md"
    echo ""
else
    echo ""
    error "Installation completed with errors. Review the health check output above."
    echo ""
    echo "Troubleshooting:"
    echo "  docker logs quorum-db       # PostgreSQL logs"
    echo "  docker logs quorum-ollama   # Ollama logs"
    echo "  docker ps                   # Check running containers"
    echo ""
    exit 1
fi
