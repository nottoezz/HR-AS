#!/usr/bin/env bash

# Simple helper to set up and run the HR Admin app locally.
# Usage (from this hr-admin directory):
#   chmod +x ./run-local.sh
#   ./run-local.sh           # start in dev mode (hot reload)
#   ./run-local.sh --preview # build and start in production-like mode

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [ ! -f "package.json" ]; then
  echo "This script must be located in and run from the hr-admin project root (where package.json lives)." >&2
  exit 1
fi

MODE="dev"
if [[ "${1-}" == "--preview" ]]; then
  MODE="preview"
fi

echo "Working directory: $(pwd)"

# Ensure .env exists
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    echo "No .env file found. Creating one from .env.example..."
    cp .env.example .env
    echo "A new .env has been created from .env.example."
    echo "You can edit it now if you want to customize secrets or URLs."
  else
    echo "Missing .env and .env.example. Please create a .env file manually." >&2
    exit 1
  fi
fi

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Please install Node.js 18+ and try again." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" || echo 0)"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node.js 18+ is required. Current version: $(node -v)" >&2
  exit 1
fi

echo
echo "Installing npm dependencies (this may take a moment)..."
npm install

echo
echo "Running database migrations (npm run db:generate)..."
npm run db:generate

echo
echo "Seeding database (npm run db:seed)..."
npm run db:seed

echo
if [ "$MODE" = "preview" ]; then
  echo "Starting app in preview (production-like) mode on http://localhost:3000 ..."
  npm run preview
else
  echo "Starting app in dev mode on http://localhost:3000 ..."
  npm run dev
fi

