#!/bin/bash
set -e

echo ""
echo "  biospy installer"
echo "  ════════════════"
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "  ✗ Node.js not found"
  echo ""
  echo "  Install Node.js 20+ first:"
  echo "    macOS:   brew install node"
  echo "    Linux:   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs"
  echo "    Windows: https://nodejs.org"
  exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 20 ]; then
  echo "  ✗ Node.js $NODE_VER found, need 20+"
  exit 1
fi
echo "  ✓ Node.js $(node -v)"

# Install biospy
echo "  → Installing biospy..."
npm install -g biospy 2>/dev/null || npm install 2>/dev/null

# Build if local install
if [ -f "package.json" ] && grep -q '"biospy"' package.json 2>/dev/null; then
  npm run build 2>/dev/null
  echo "  ✓ Built from source"
  echo ""
  echo "  Run with: node dist/cli.js <command>"
  echo "  Or link:  npm link"
else
  echo "  ✓ biospy installed"
  echo ""
  echo "  Run with: biospy <command>"
fi

# Optional: flashrom
echo ""
if command -v flashrom &>/dev/null; then
  echo "  ✓ flashrom $(flashrom --version 2>&1 | head -1 | grep -oP 'v[\d.]+')"
else
  echo "  ○ flashrom not installed (optional, biospy has native USB support)"
  case "$(uname -s)" in
    Darwin) echo "    Install: brew install flashrom" ;;
    Linux)  echo "    Install: sudo apt install flashrom" ;;
  esac
fi

echo ""
echo "  Ready! Plug in your CH341A programmer and run:"
echo ""
echo "    biospy status"
echo ""
