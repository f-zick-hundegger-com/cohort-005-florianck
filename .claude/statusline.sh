#!/usr/bin/env bash
# Claude Code status line: shows current context usage vs. the max context window.
# Green by default, red once usage exceeds 150k tokens.

input=$(cat)

THRESHOLD=150000

max=$(echo "$input" | jq -r '.context_window.context_window_size // 200000')

# Current context = input tokens of the latest request (incl. cache reads/writes).
used=$(echo "$input" | jq -r '
  .context_window.current_usage as $u
  | if $u then (($u.input_tokens // 0) + ($u.cache_creation_input_tokens // 0) + ($u.cache_read_input_tokens // 0))
    else empty end')

# Fallback: read the last assistant usage entry from the transcript.
if [ -z "$used" ] || [ "$used" = "null" ]; then
  transcript=$(echo "$input" | jq -r '.transcript_path // empty')
  if [ -n "$transcript" ] && [ -f "$transcript" ]; then
    used=$(tac "$transcript" | jq -r 'select(.message.usage and (.isSidechain | not)) | .message.usage
      | (.input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.cache_read_input_tokens // 0)' 2>/dev/null | head -n1)
  fi
fi
used=${used:-0}

fmt() { awk -v n="$1" 'BEGIN { if (n >= 1000000) printf "%.1fM", n/1000000; else if (n >= 1000) printf "%.1fk", n/1000; else printf "%d", n }'; }

pct=$(awk -v u="$used" -v m="$max" 'BEGIN { if (m > 0) printf "%d", (u*100)/m; else print 0 }')

if [ "$used" -gt "$THRESHOLD" ]; then
  color='\033[31m' # red
else
  color='\033[32m' # green
fi
reset='\033[0m'

printf "${color}Context: %s / %s (%s%%)${reset}" "$(fmt "$used")" "$(fmt "$max")" "$pct"
