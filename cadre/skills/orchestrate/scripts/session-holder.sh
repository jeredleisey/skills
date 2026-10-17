#!/usr/bin/env bash
# Tell if a live Claude Code session on this machine holds a session id.
# Usage: session-holder.sh <session-id>
# Output and exit code:
#   held pid=<pid> name=<name> cwd=<cwd> status=<status>   exit 0   another session holds it
#   free                                                   exit 1   no live session holds it
#   unknown: <reason>                                      exit 2   the check cannot tell
#   self pid=<pid>                                         exit 3   this session holds it
#   usage message on stderr                                exit 64  wrong arguments
# The source is `claude agents --json`, a documented interface. It prints
# a JSON array of the active sessions, with the fields pid, sessionId,
# name, cwd, kind, and status. A listed pid can be stale, and a pid can
# go to a new process, so the script checks that the pid is alive and is
# Claude. A failure to run the command, to parse its output, or to read a
# process gives unknown, never free.
# Set CLAUDE_AGENTS_JSON_CMD to use another command, for example a test
# that reads a fixture: CLAUDE_AGENTS_JSON_CMD='cat fixture.json'.
set -euo pipefail

if [ $# -ne 1 ] || [ -z "$1" ]; then
  echo "usage: session-holder.sh <session-id>" >&2
  exit 64
fi
want=$1
if ! [[ $want =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  echo "unknown: not a session id: $want"   # a session name, not an id, cannot be checked
  exit 2
fi
sep=$'\x1f'

if command -v jq >/dev/null 2>&1; then
  reader=jq
elif command -v python3 >/dev/null 2>&1; then
  reader=python3
else
  echo "unknown: no jq and no python3"
  exit 2
fi

cmd=${CLAUDE_AGENTS_JSON_CMD:-}
if [ -z "$cmd" ]; then
  if ! command -v claude >/dev/null 2>&1; then
    echo "unknown: claude is not installed"
    exit 2
  fi
  cmd="claude agents --json"
fi
if ! json=$(bash -c "$cmd" 2>/dev/null); then
  echo "unknown: the command failed: $cmd"
  exit 2
fi
if [ -z "${json//[[:space:]]/}" ]; then
  echo "unknown: the command printed nothing: $cmd"
  exit 2
fi

# Print one line for each session that has the id: "pid<sep>name<sep>cwd<sep>status".
# Exit 1 if the text is not a JSON array.
if [ "$reader" = jq ]; then
  rows=$(printf '%s' "$json" | jq -r --arg id "$want" --arg sep "$sep" \
    'if type != "array" then error("not an array") else .[] end
     | if type != "object" then error("not an object") else . end
     | select(.sessionId == $id)
     | [(.pid // ""), (.name // ""), (.cwd // ""), (.status // "")] | map(tostring) | join($sep)' 2>/dev/null) || rows=BAD
else
  rows=$(printf '%s' "$json" | python3 -c '
import json, sys
d = json.load(sys.stdin)
if not isinstance(d, list):
    sys.exit(1)
for s in d:
    if not isinstance(s, dict):
        sys.exit(1)
    if s.get("sessionId") == sys.argv[1]:
        print(sys.argv[2].join("" if s.get(k) is None else str(s[k]) for k in ("pid", "name", "cwd", "status")))
' "$want" "$sep" 2>/dev/null) || rows=BAD
fi
if [ "$rows" = BAD ]; then
  echo "unknown: the output is not a JSON array of sessions"
  exit 2
fi

failed=""
held=""
[ -n "$rows" ] || rows=NONE
while IFS="$sep" read -r pid name cwd status; do
  [ "$pid" = NONE ] && break
  case $pid in '' | *[!0-9]*) failed="no pid in the entry for $want"; continue ;; esac
  if ! kill -0 "$pid" 2>/dev/null; then
    continue                                  # a stale entry: its process died
  fi
  if ! comm=$(ps -p "$pid" -o comm= 2>/dev/null); then
    failed="cannot read process $pid"
    continue
  fi
  [ "$(basename "$comm")" = claude ] || continue   # the pid went to another program
  if [ "$pid" = "${CLAUDE_PID:-}" ]; then
    echo "self pid=$pid"                      # self wins over another entry with the same id
    exit 3
  fi
  [ -n "$held" ] || held="held pid=$pid name=$name cwd=$cwd status=$status"
done <<<"$rows"
if [ -n "$held" ]; then
  echo "$held"
  exit 0
fi
if [ -n "$failed" ]; then
  echo "unknown: $failed"
  exit 2
fi
echo "free"
exit 1
