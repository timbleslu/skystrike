#!/bin/bash
# Pre-commit guard: block commits whose staged diff adds an obvious credential.
set -euo pipefail
cd "$(dirname "$0")/../.."

PATTERNS='(AKIA[0-9A-Z]{16}|gh[oprsu]_[A-Za-z0-9]{36}|sk-(ant-)?[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----)'

MATCHES=$(git diff --cached -U0 | grep -E '^\+' | grep -Ev '^\+\+\+' | grep -E "$PATTERNS" || true)

if [ -n "$MATCHES" ]; then
  echo "BLOCKED: staged diff appears to contain a credential:" >&2
  echo "$MATCHES" >&2
  exit 2
fi
exit 0
