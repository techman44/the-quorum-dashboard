#!/bin/bash

# Deployment script for quorum-dashboard to Mac Mini
# Run this after fixing SSH authentication

MAC_MINI_USER="root"
MAC_MINI_HOST="192.168.20.36"
REMOTE_DIR="/opt/quorum/standalone-dashboard"  # Adjust this path as needed

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

# Copy essential files
rsync -avz --delete \
  .next/ \
  package.json \
  package-lock.json \
  public/ \
  src/ \
  .env.local \
  $MAC_MINI_USER@$MAC_MINI_HOST:$REMOTE_DIR/

if [ $? -ne 0 ]; then
  echo "❌ Failed to copy files. Check SSH connection."
  exit 1
fi

echo "🔧 Installing dependencies and restarting on Mac Mini..."

ssh $MAC_MINI_USER@$MAC_MINI_HOST << 'ENDSSH'
  cd /Users/dean/quorum-dashboard

  # Install dependencies
  npm install --production

  # Restart the application (adjust based on your setup)
  if command -v pm2 &> /dev/null; then
    pm2 restart quorum-dashboard
  elif command -v systemctl &> /dev/null; then
    sudo systemctl restart quorum-dashboard
  else
    echo "⚠️  No process manager found. Please restart manually."
  fi
ENDSSH

if [ $? -eq 0 ]; then
  echo "✅ Deployment successful!"
  echo "🌐 Check the application at http://$MAC_MINI_HOST:3000"
else
  echo "❌ Deployment failed during remote commands."
  exit 1
fi
