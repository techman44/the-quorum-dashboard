#!/bin/bash

# Deployment script for quorum-dashboard to Mac Mini
# Run this after fixing SSH authentication

MAC_MINI_USER="root"
MAC_MINI_HOST="192.168.20.36"
REMOTE_DIR="/opt/quorum/standalone-dashboard"

echo "🚀 Starting deployment of quorum-dashboard to Mac Mini..."

# Check if build exists
if [ ! -d ".next" ]; then
  echo "📦 Building application..."
  npm run build
  if [ $? -ne 0 ]; then
    echo "❌ Build failed. Aborting deployment."
    exit 1
  fi
fi

echo "📤 Copying files to Mac Mini..."

# First, stop the container to release the volume
ssh $MAC_MINI_USER@$MAC_MINI_HOST << 'ENDSSH'
  if docker ps -a | grep -q quorum-dashboard; then
    docker stop quorum-dashboard 2>/dev/null || true
    docker rm quorum-dashboard 2>/dev/null || true
  fi
ENDSSH

# Now clean and copy files
ssh $MAC_MINI_USER@$MAC_MINI_HOST "rm -rf $REMOTE_DIR/.next $REMOTE_DIR/public $REMOTE_DIR/src $REMOTE_DIR/next.config.*"

# Copy essential files using scp (more portable than rsync)
# Note: We don't copy .env.local since environment is set via docker run
scp -r .next $MAC_MINI_USER@$MAC_MINI_HOST:$REMOTE_DIR/
scp -r package.json package-lock.json $MAC_MINI_USER@$MAC_MINI_HOST:$REMOTE_DIR/
scp -r next.config.js $MAC_MINI_USER@$MAC_MINI_HOST:$REMOTE_DIR/
scp -r public $MAC_MINI_USER@$MAC_MINI_HOST:$REMOTE_DIR/
scp -r src $MAC_MINI_USER@$MAC_MINI_HOST:$REMOTE_DIR/

if [ $? -ne 0 ]; then
  echo "❌ Failed to copy files. Check SSH connection."
  exit 1
fi

echo "🔧 Installing dependencies and gogcli on Mac Mini..."

ssh $MAC_MINI_USER@$MAC_MINI_HOST << 'ENDSSH'
  # Ensure gogcli is installed on the host (persistent location)
  if [ ! -f "/usr/local/bin/gogcli" ]; then
    echo "📦 Installing gogcli..."
    cd /tmp
    curl -L -o gogcli.tar.gz https://github.com/steipete/gogcli/releases/download/v0.9.0/gogcli_0.9.0_linux_amd64.tar.gz
    tar -xzf gogcli.tar.gz
    mv gog /usr/local/bin/gogcli
    chmod +x /usr/local/bin/gogcli
    rm -f gogcli.tar.gz
    echo "✅ gogcli installed"
  fi

  cd /opt/quorum/standalone-dashboard

  # Install dependencies (skip if node_modules exists)
  if [ ! -d "node_modules" ]; then
    npm install --production
  fi

  # Start new container on the same network as postgres and ollama
  # Mount gogcli from host into container
  docker run -d \
    --name quorum-dashboard \
    --restart unless-stopped \
    --network quorum_default \
    -p 3000:3000 \
    -e PORT=3000 \
    -e QUORUM_DB_HOST=quorum-postgres \
    -e QUORUM_DB_PORT=5432 \
    -e QUORUM_DB_NAME=quorum \
    -e QUORUM_DB_USER=quorum \
    -e QUORUM_DB_PASSWORD="quorum123" \
    -e OLLAMA_HOST=http://ollama:11434 \
    -e ENCRYPTION_KEY="$(openssl rand -base64 32)" \
    -v /opt/quorum/standalone-dashboard:/app \
    -v /usr/local/bin/gogcli:/usr/local/bin/gogcli:ro \
    -w /app \
    node:20 \
    npx next start -p 3000

  echo "✅ Container started"
ENDSSH

if [ $? -eq 0 ]; then
  echo "✅ Deployment successful!"
  echo "🌐 Check the application at http://$MAC_MINI_HOST:3000"
else
  echo "❌ Deployment failed during remote commands."
  exit 1
fi
