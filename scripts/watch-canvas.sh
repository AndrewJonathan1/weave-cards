#!/bin/bash
# Watch a canvas JSON file for changes and show diffs
# Usage: ./watch-canvas.sh path/to/canvas.json

FILE="${1:?Usage: watch-canvas.sh <canvas.json>}"
LAST_HASH=""
LAST_SNAPSHOT=$(mktemp)
echo '{}' > "$LAST_SNAPSHOT"

echo "👁  Watching: $FILE"
echo "   Cmd+K to clear, Ctrl+C to stop"
echo "─────────────────────────────────────"

while true; do
  if [ -f "$FILE" ]; then
    HASH=$(md5 -q "$FILE" 2>/dev/null)
    if [ "$HASH" != "$LAST_HASH" ] && [ -n "$LAST_HASH" ]; then
      NOW=$(date '+%H:%M:%S')
      echo ""
      echo "⚡ $NOW — File changed"
      
      # Show summary
      python3 -c "
import json, sys
try:
    old = json.load(open('$LAST_SNAPSHOT'))
    new = json.load(open('$FILE'))
    oc = {c['id']: c for c in old.get('cards', [])}
    nc = {c['id']: c for c in new.get('cards', [])}
    added = [nc[k] for k in nc if k not in oc]
    removed = [oc[k] for k in oc if k not in nc]
    modified = []
    for k in nc:
        if k in oc and nc[k] != oc[k]:
            modified.append((oc[k], nc[k]))
    if added:
        print(f'  + {len(added)} card(s) added:')
        for c in added:
            print(f'    [{c[\"id\"][:10]}] ({c[\"x\"]},{c[\"y\"]}) {c[\"content\"][:50]}')
    if removed:
        print(f'  - {len(removed)} card(s) removed:')
        for c in removed:
            print(f'    [{c[\"id\"][:10]}] {c[\"content\"][:50]}')
    if modified:
        print(f'  ~ {len(modified)} card(s) modified:')
        for old_c, new_c in modified:
            changes = []
            if old_c.get('content') != new_c.get('content'):
                changes.append('content')
            if old_c.get('x') != new_c.get('x') or old_c.get('y') != new_c.get('y'):
                changes.append(f'pos ({old_c[\"x\"]},{old_c[\"y\"]})->({new_c[\"x\"]},{new_c[\"y\"]})')
            if old_c.get('w') != new_c.get('w') or old_c.get('h') != new_c.get('h'):
                changes.append(f'size ({old_c[\"w\"]}x{old_c[\"h\"]})->({new_c[\"w\"]}x{new_c[\"h\"]})')
            if old_c.get('color') != new_c.get('color'):
                changes.append(f'color {old_c[\"color\"]}->{new_c[\"color\"]}')
            print(f'    [{new_c[\"id\"][:10]}] {\" | \".join(changes)}')
    oc_conn = len(old.get('connections', []))
    nc_conn = len(new.get('connections', []))
    if oc_conn != nc_conn:
        print(f'  ⤳ connections: {oc_conn} → {nc_conn}')
    print(f'  Total: {len(nc)} cards, {nc_conn} connections')
except Exception as e:
    print(f'  (parse error: {e})')
" 2>/dev/null
      echo "─────────────────────────────────────"
      
      # Save snapshot for next diff
      cp "$FILE" "$LAST_SNAPSHOT"
    elif [ -z "$LAST_HASH" ]; then
      # First run — just snapshot
      cp "$FILE" "$LAST_SNAPSHOT"
      CARDS=$(python3 -c "import json; d=json.load(open('$FILE')); print(len(d.get('cards',[])))" 2>/dev/null)
      CONNS=$(python3 -c "import json; d=json.load(open('$FILE')); print(len(d.get('connections',[])))" 2>/dev/null)
      echo "  Initial: $CARDS cards, $CONNS connections"
      echo "─────────────────────────────────────"
    fi
    LAST_HASH="$HASH"
  fi
  sleep 1
done
