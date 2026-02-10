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

# Clean and create remote directory, then copy files using scp
ssh $MAC_MINI_USER@$MAC_MINI_HOST "mkdir -p $REMOTE_DIR && rm -rf $REMOTE_DIR/.next $REMOTE_DIR/public $REMOTE_DIR/src"

# Copy essential files using scp (more portable than rsync)
# Note: We don't copy .env.local since environment is set via docker run
scp -r .next $MAC_MINI_USER@$MAC_MINI_HOST:$REMOTE_DIR/
scp -r package.json package-lock.json $MAC_MINI_USER@$MAC_MINI_HOST:$REMOTE_DIR/
scp -r public $MAC_MINI_USER@$MAC_MINI_HOST:$REMOTE_DIR/
scp -r src $MAC_MINI_USER@$MAC_MINI_HOST:$REMOTE_DIR/

if [ $? -ne 0 ]; then
  echo "❌ Failed to copy files. Check SSH connection."
  exit 1
fi

echo "🔧 Installing dependencies and restarting on Mac Mini..."

ssh $MAC_MINI_USER@$MAC_MINI_HOST << 'ENDSSH'
  cd /opt/quorum/standalone-dashboard

  # Install dependencies
  npm install --production

  # Restart the application using Docker
  if docker ps | grep -q quorum-dashboard; then
    docker stop quorum-dashboard
    docker rm quorum-dashboard
  fi

  # Start new container on the same network as postgres and ollama
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
    -e QUORUM_DB_PASSWORD="" \
    -e OLLAMA_HOST=http://ollama:11434 \
    -e ENCRYPTION_KEY="$(openssl rand -base64 32)" \
    -v /opt/quorum/standalone-dashboard:/app \
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
