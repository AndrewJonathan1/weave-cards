#!/bin/bash
# Watch a JSON file for changes and show colored diffs live.
# Usage: ./watch-diff.sh path/to/canvas.json
#
# No dependencies — uses only built-in macOS tools.
# Press Ctrl+C to stop.

FILE="${1:?Usage: $0 <file-to-watch>}"

if [ ! -f "$FILE" ]; then
  echo "Waiting for $FILE to be created..."
  while [ ! -f "$FILE" ]; do sleep 0.5; done
  echo "File created!"
fi

TMPDIR=$(mktemp -d)
PREV="$TMPDIR/prev.json"
cp "$FILE" "$PREV" 2>/dev/null || echo "{}" > "$PREV"

echo "Watching: $FILE"
echo "Press Ctrl+C to stop."
echo "---"

while true; do
  # Wait until the file's modification time changes
  PREV_MOD=$(stat -f %m "$FILE" 2>/dev/null || echo 0)
  while true; do
    sleep 0.3
    CURR_MOD=$(stat -f %m "$FILE" 2>/dev/null || echo 0)
    if [ "$CURR_MOD" != "$PREV_MOD" ]; then
      break
    fi
  done

  # Pretty-print both versions for readable diffs (if python3 available)
  if command -v python3 &>/dev/null; then
    python3 -m json.tool "$PREV" > "$TMPDIR/prev_pretty.json" 2>/dev/null || cp "$PREV" "$TMPDIR/prev_pretty.json"
    python3 -m json.tool "$FILE" > "$TMPDIR/curr_pretty.json" 2>/dev/null || cp "$FILE" "$TMPDIR/curr_pretty.json"
    DIFF=$(diff --unified=2 "$TMPDIR/prev_pretty.json" "$TMPDIR/curr_pretty.json")
  else
    DIFF=$(diff --unified=2 "$PREV" "$FILE")
  fi

  if [ -n "$DIFF" ]; then
    echo ""
    echo "$(date '+%H:%M:%S') — changed:"
    # Color the diff output: green for additions, red for removals
    echo "$DIFF" | while IFS= read -r line; do
      case "$line" in
        +*) printf '\033[32m%s\033[0m\n' "$line" ;;  # green
        -*) printf '\033[31m%s\033[0m\n' "$line" ;;  # red
        @*) printf '\033[36m%s\033[0m\n' "$line" ;;  # cyan
        *)  echo "$line" ;;
      esac
    done
  fi

  cp "$FILE" "$PREV" 2>/dev/null
done
