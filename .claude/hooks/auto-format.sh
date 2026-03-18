#!/usr/bin/env bash
# Hook: auto-format after file writes
# Runs the project formatter on modified files

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only format known source files
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.json)
    if command -v npx &> /dev/null && [ -f "package.json" ]; then
      npx prettier --write "$FILE_PATH" 2>/dev/null || true
    fi
    ;;
esac

exit 0
