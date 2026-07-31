#!/bin/sh
# Runs a claudemon script with whatever node we can find.
#
# Hooks and the status line are executed with a reduced PATH and without a
# controlling terminal, so `#!/usr/bin/env node` is not reliable here. We look
# in the usual install locations before falling back to PATH.
#
# Usage: run.sh <script-name.mjs> [args...]
#
# If no node is available we exit 0 and stay silent: a missing interpreter must
# never break the user's prompt or blank their status line.

script_name=$1
[ -n "$script_name" ] || exit 0
shift

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

node_bin=
if [ -n "$CLAUDEMON_NODE" ] && [ -x "$CLAUDEMON_NODE" ]; then
  node_bin=$CLAUDEMON_NODE
else
  for candidate in \
    /opt/homebrew/bin/node \
    /usr/local/bin/node \
    /usr/bin/node \
    "$HOME/.local/bin/node" \
    "$HOME/.volta/bin/node"
  do
    if [ -x "$candidate" ]; then
      node_bin=$candidate
      break
    fi
  done
fi

[ -n "$node_bin" ] || node_bin=$(command -v node 2>/dev/null)
[ -n "$node_bin" ] || exit 0

exec "$node_bin" "$script_dir/$script_name" "$@"
