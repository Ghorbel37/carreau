#!/usr/bin/env bash
# Usage: release-notes.sh <version> <commit> [extra apk name]
# Writes release-notes.md: what's new (from the commit message) and how to install.
set -euo pipefail
version=$1 commit=$2 extra=${3:-}
{
  echo "**Carreau v$version** · Android versionCode ${version##*.} · commit \`$(git rev-parse --short "$commit")\`"
  echo
  echo "## What's new"
  echo
  echo "### $(git log -1 --format=%s "$commit")"
  echo
  git log -1 --format=%b "$commit"
  echo
  echo "## Install"
  echo
  echo "- **Android:** download \`carreau-v$version.apk\` on your phone, open it, and allow installs from this source when asked. Updates install over the previous version and keep your progress."
  if [ -n "$extra" ]; then
    echo "- **Always the newest:** https://github.com/Ghorbel37/carreau/releases/latest/download/carreau.apk"
  fi
  echo "- **Browser:** https://ghorbel37.github.io/carreau/ (the newest build from \`main\`)"
} > release-notes.md
