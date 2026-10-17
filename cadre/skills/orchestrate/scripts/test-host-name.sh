#!/usr/bin/env bash
# Test host-name.sh. It runs each branch on one machine, through the
# variables HOST_NAME_OS, HOST_NAME_SCUTIL_CMD, HOST_NAME_HOSTNAME_CMD,
# and COMPUTERNAME. It checks the output line and the exit code.
# Usage: test-host-name.sh
# Prints one line per case, "ok" or "FAIL". Exits 1 if any case fails.
set -uo pipefail

script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/host-name.sh"
fails=0

# check <title> <expected line> <expected exit> <env assignment>...
check() {
  local title=$1 want_line=$2 want_code=$3
  shift 3
  local line code
  line=$(env -u COMPUTERNAME -u HOST_NAME_OS -u HOST_NAME_SCUTIL_CMD -u HOST_NAME_HOSTNAME_CMD "$@" bash "$script" 2>/dev/null)
  code=$?
  if [ "$line" = "$want_line" ] && [ "$code" = "$want_code" ]; then
    echo "ok   $title"
  else
    echo "FAIL $title: want '$want_line' exit $want_code, got '$line' exit $code"
    fails=$((fails + 1))
  fi
}

check "macOS uses scutil" "Test-Mac" 0 \
  HOST_NAME_OS=Darwin HOST_NAME_SCUTIL_CMD="echo Test-Mac" HOST_NAME_HOSTNAME_CMD="echo wrong"
check "Linux uses hostname" "test-linux" 0 \
  HOST_NAME_OS=Linux HOST_NAME_HOSTNAME_CMD="echo test-linux" HOST_NAME_SCUTIL_CMD="echo wrong"
check "Windows MINGW uses COMPUTERNAME" "TEST-WIN" 0 \
  HOST_NAME_OS=MINGW64_NT-10.0 COMPUTERNAME=TEST-WIN
check "Windows MSYS uses COMPUTERNAME" "TEST-WIN" 0 \
  HOST_NAME_OS=MSYS_NT-10.0 COMPUTERNAME=TEST-WIN
check "Windows CYGWIN uses COMPUTERNAME" "TEST-WIN" 0 \
  HOST_NAME_OS=CYGWIN_NT-10.0 COMPUTERNAME=TEST-WIN
check "macOS empty output" "unknown: scutil printed nothing" 2 \
  HOST_NAME_OS=Darwin HOST_NAME_SCUTIL_CMD="true"
check "macOS failed command" "unknown: scutil failed" 2 \
  HOST_NAME_OS=Darwin HOST_NAME_SCUTIL_CMD="false"
check "Linux empty output" "unknown: hostname printed nothing" 2 \
  HOST_NAME_OS=Linux HOST_NAME_HOSTNAME_CMD="true"
check "Linux failed command" "unknown: hostname failed" 2 \
  HOST_NAME_OS=Linux HOST_NAME_HOSTNAME_CMD="false"
check "Windows empty COMPUTERNAME" "unknown: COMPUTERNAME is empty" 2 \
  HOST_NAME_OS=MINGW64_NT-10.0 COMPUTERNAME=
check "Windows no COMPUTERNAME" "unknown: COMPUTERNAME is empty" 2 \
  HOST_NAME_OS=MINGW64_NT-10.0
check "macOS multi-line output" "unknown: scutil printed more than one line" 2 \
  HOST_NAME_OS=Darwin HOST_NAME_SCUTIL_CMD='printf "a\nb\n"'
check "Linux multi-line output" "unknown: hostname printed more than one line" 2 \
  HOST_NAME_OS=Linux HOST_NAME_HOSTNAME_CMD='printf "a\nb\n"'
check "macOS padded output trims" "Test-Mac" 0 \
  HOST_NAME_OS=Darwin HOST_NAME_SCUTIL_CMD='printf "  Test-Mac  \n"'
check "Linux padded output trims" "test-linux" 0 \
  HOST_NAME_OS=Linux HOST_NAME_HOSTNAME_CMD='printf "  test-linux  \n"'
check "Windows padded COMPUTERNAME trims" "TEST-WIN" 0 \
  HOST_NAME_OS=MINGW64_NT-10.0 "COMPUTERNAME=  TEST-WIN  "
check "Windows whitespace-only COMPUTERNAME" "unknown: COMPUTERNAME is empty" 2 \
  HOST_NAME_OS=MINGW64_NT-10.0 "COMPUTERNAME=   "
check "unknown OS" "unknown: unknown OS: Plan9" 2 \
  HOST_NAME_OS=Plan9

if [ "$fails" -ne 0 ]; then
  echo "$fails case(s) failed"
  exit 1
fi
echo "all cases passed"
