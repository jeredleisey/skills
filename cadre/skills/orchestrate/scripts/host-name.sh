#!/usr/bin/env bash
# Print one stable name for this machine, for the host field of a handoff note.
# Usage: host-name.sh
# Output and exit code:
#   <name>                 exit 0   the name of this machine
#   unknown: <reason>      exit 2   the script cannot get a name
# The source depends on the OS, because the short host name is not stable on macOS.
# With no HostName set, macOS takes the name from the network, and the name
# can change from one run to the next.
#   macOS (Darwin)                    scutil --get LocalHostName
#   Linux                             hostname, short form
#   Windows (Git Bash: MINGW, MSYS,   $COMPUTERNAME
#   CYGWIN)
# An unknown OS, a failed command, or an empty name gives unknown, never
# an empty or a wrong name.
# Set HOST_NAME_OS to use another result of `uname -s`. Set
# HOST_NAME_SCUTIL_CMD or HOST_NAME_HOSTNAME_CMD to use another command,
# for example a test: HOST_NAME_SCUTIL_CMD='echo Test-Mac'.
set -euo pipefail

os=${HOST_NAME_OS:-}
if [ -z "$os" ]; then
  if ! os=$(uname -s 2>/dev/null) || [ -z "$os" ]; then
    echo "unknown: cannot read the OS"
    exit 2
  fi
fi

# check_name <label> <value> <empty reason>: print the trimmed value, or print unknown and exit 2.
check_name() {
  local label=$1 out=$2 empty=$3
  out=${out#"${out%%[![:space:]]*}"}
  out=${out%"${out##*[![:space:]]}"}
  if [ -z "$out" ]; then
    echo "unknown: $empty"
    exit 2
  fi
  if [[ $out == *$'\n'* ]]; then
    echo "unknown: $label printed more than one line"
    exit 2
  fi
  echo "$out"
}

# run_name <label> <command>: run the command, then check its output.
run_name() {
  local label=$1 cmd=$2 out
  if ! out=$(bash -c "$cmd" 2>/dev/null); then
    echo "unknown: $label failed"
    exit 2
  fi
  check_name "$label" "$out" "$label printed nothing"
}

case $os in
  Darwin)
    run_name scutil "${HOST_NAME_SCUTIL_CMD:-scutil --get LocalHostName}"
    ;;
  Linux)
    run_name hostname "${HOST_NAME_HOSTNAME_CMD:-hostname -s}"
    ;;
  MINGW* | MSYS* | CYGWIN*)
    check_name COMPUTERNAME "${COMPUTERNAME:-}" "COMPUTERNAME is empty"
    ;;
  *)
    echo "unknown: unknown OS: $os"
    exit 2
    ;;
esac
