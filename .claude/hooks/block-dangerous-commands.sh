#!/usr/bin/env bash
# Hook: block dangerous commands before execution
# Catches patterns that should never run without explicit confirmation

set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Block patterns
BLOCKED_PATTERNS=(
  "rm -rf /"
  "rm -rf ~"
  "rm -rf \$HOME"
  ":(){:|:&};:"
  "mkfs"
  "dd if="
  "> /dev/sd"
)

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qF "$pattern"; then
    echo "BLOCKED: Dangerous command detected: $pattern" >&2
    exit 2
  fi
done

exit 0
