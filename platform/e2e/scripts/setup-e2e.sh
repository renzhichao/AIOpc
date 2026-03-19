#!/bin/bash

# E2E Framework Setup Script
# This script installs Playwright browsers and verifies the setup

set -e

echo "🔧 Setting up E2E testing framework..."

# Navigate to E2E directory
cd "$(dirname "$0")/.."

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "⚠️  pnpm not found. Installing pnpm..."
    npm install -g pnpm
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Install Playwright browsers
echo "🌐 Installing Playwright browsers..."
npx playwright install --with-deps

echo "✅ E2E framework setup complete!"
echo ""
echo "🚀 Run tests with:"
echo "   cd platform/e2e"
echo "   pnpm test"
echo ""
echo "📖 View documentation:"
echo "   cat platform/e2e/README.md"
