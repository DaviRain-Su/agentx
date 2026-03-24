#!/bin/bash
# Quick deployment script for hackathon

set -e

echo "🚀 Quick Deploy for X Layer Hackathon"
echo "======================================"

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler not found. Installing..."
    npm install -g wrangler
fi

# Check if logged in
echo "🔐 Checking Cloudflare login..."
wrangler whoami || (echo "❌ Please login: wrangler login" && exit 1)

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Build
echo "🔨 Building..."
npm run build

# Set secrets (interactive)
echo ""
echo "🔑 Setting up secrets..."
echo "You'll need:"
echo "  1. X Layer RPC URL (https://xlayertestrpc.okx.com)"
echo "  2. Node private key (with some OKB for gas)"
echo "  3. Cloudflare Account ID"
echo "  4. Cloudflare API Token"
echo ""

read -p "Continue with secret setup? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Setting secrets..."
    
    # Required secrets
    wrangler secret put XLAYER_RPC_URL
    wrangler secret put NODE_PRIVATE_KEY
    wrangler secret put CF_ACCOUNT_ID
    wrangler secret put CF_GATEWAY_TOKEN
    
    # Optional
    read -p "Set ANTHROPIC_API_KEY? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        wrangler secret put ANTHROPIC_API_KEY
    fi
fi

# Deploy
echo ""
echo "☁️ Deploying to Cloudflare..."
wrangler deploy

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Test your Worker:"
echo "  curl https://gradience-worker.davirain-yin.workers.dev/health"
echo ""
echo "Check logs:"
echo "  wrangler tail"
