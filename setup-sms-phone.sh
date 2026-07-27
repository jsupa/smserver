#!/usr/bin/env bash
# setup-sms-phone.sh — Initialize iPhone 6 as SMS API gateway (SMServer).
#
# This device is NOT part of the captcha solver pool — it runs SMServer
# to provide SMS send/receive capability. It is NOT added to devices.json.
#
# Device: iPhone 6 (iPhone7,2 / N61AP)
#   UDID:    e5b2cc8393e60b9a51ed5b59fcb111a942070734
#   iOS:     12.5.8 (Build 16H88)
#   Chip:    28672 (arm64)
#   Serial:  C8QNVEUXG5MP
#   Model:   MG482
#
# What this script does:
#   1. Verifies the device is connected via USB
#   2. Starts an SSH tunnel (USB → localhost:2225)
#   3. Verifies SSH connectivity
#   4. Kills any stale SMServer on the device, then starts it fresh
#      with: ./SMServer12 -b --no_secure --no_authentication --server_port 8080 --socket_port 8081 --debug
#   5. Starts iproxy tunnels for SMServer:
#      HTTP:      localhost:8085 → device:8080
#      WebSocket: localhost:8081 → device:8081
#   6. Reports status and access URLs
#
# Usage:
#   ./scripts/setup-sms-phone.sh
#
# Idempotent — safe to run repeatedly. Kills stale tunnels and SMServer
# before starting fresh ones.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SSH_KEY="${HOME}/.ssh/id_ed25519_ios"

# ── Device constants (hardcoded — NOT in devices.json) ─────────────

DEVICE_UDID="e5b2cc8393e60b9a51ed5b59fcb111a942070734"
DEVICE_NAME="iPhone6-SMS"
DEVICE_MODEL="iPhone 6 (iPhone7,2 / N61AP)"
DEVICE_IOS="12.5.8"
DEVICE_BUILD="16H88"
DEVICE_SERIAL="C8QNVEUXG5MP"
DEVICE_CHIP="28672"
DEVICE_CPU="arm64"
DEVICE_MODEL_NO="MG482"

SSH_USER="root"                # iPhone 6 uses root (jailbroken, shown as root# prompt)
SSH_FALLBACK_USER="mobile"     # fallback if root doesn't work
SSH_LOCAL_PORT="2225"          # local port → device SSH (22)
SMSERVER_DEVICE_HTTP_PORT="8080"
SMSERVER_DEVICE_WS_PORT="8081"
SMSERVER_LOCAL_HTTP_PORT="8085"     # local → device HTTP
SMSERVER_LOCAL_WS_PORT="8081"       # local → device WebSocket (must match device port — web UI expects same port)
SMSERVER_PATH="/Applications/SMServer12.app"
SMSERVER_BIN="./SMServer12"
SMSERVER_LOG="/tmp/smserver.log"
# --no_secure = no TLS, --no_authentication = no password, --debug = verbose logs
# NOTE: -b (background) flag NOT used — it requires IPC permissions unavailable on iOS 12.
# Instead, stdin is kept open via 'tail -f /dev/null |' pipe to prevent SMServer from exiting.
SMSERVER_ARGS="--no_secure --no_authentication --server_port ${SMSERVER_DEVICE_HTTP_PORT} --socket_port ${SMSERVER_DEVICE_WS_PORT} --debug"

# ── Colors ─────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'

log()    { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $1"; }
warn()   { echo -e "${YELLOW}[$(date +%H:%M:%S)] WARN${NC} $1"; }
err()    { echo -e "${RED}[$(date +%H:%M:%S)] ERROR${NC} $1"; }
header() { echo -e "${CYAN}$1${NC}"; }
info()   { echo -e "${BLUE}       $1${NC}"; }

# ── Banner ─────────────────────────────────────────────────────────

header "╔══════════════════════════════════════════════════════════╗"
header "║     iPhone 6 SMS Gateway Setup (SMServer)               ║"
header "╚══════════════════════════════════════════════════════════╝"
echo ""
info "Device : ${DEVICE_NAME} — ${DEVICE_MODEL}"
info "iOS    : ${DEVICE_IOS} (Build ${DEVICE_BUILD})"
info "Serial : ${DEVICE_SERIAL}"
info "CPU    : ${DEVICE_CPU} (Chip ${DEVICE_CHIP})"
info "Model  : ${DEVICE_MODEL_NO}"
info "UDID   : ${DEVICE_UDID}"
echo ""

# ── Pre-flight checks ──────────────────────────────────────────────

log "Checking prerequisites…"

if ! command -v idevice_id &>/dev/null; then
  err "idevice_id not found — install libimobiledevice"
  exit 1
fi

if ! command -v iproxy &>/dev/null; then
  err "iproxy not found — install libimobiledevice"
  exit 1
fi

if ! command -v ssh &>/dev/null; then
  err "ssh not found"
  exit 1
fi

# ── 1. Check USB connectivity ──────────────────────────────────────

log "Checking USB connectivity…"

CONNECTED=$(idevice_id -l 2>/dev/null || true)
if [ -z "$CONNECTED" ]; then
  err "No devices connected via USB."
  exit 1
fi

if ! echo "$CONNECTED" | grep -q "${DEVICE_UDID}"; then
  err "Target device ${DEVICE_UDID} NOT connected via USB."
  echo ""
  info "Connected devices:"
  echo "$CONNECTED" | while read -r udid; do
    info "  • ${udid}"
  done
  echo ""
  err "Plug in the iPhone 6 and try again."
  exit 1
fi

log "Device ${DEVICE_UDID} found via USB ✓"

# Verify it's the right device
DEVICE_PRODUCT=$(ideviceinfo -u "${DEVICE_UDID}" -k ProductType 2>/dev/null || echo "unknown")
DEVICE_VERSION=$(ideviceinfo -u "${DEVICE_UDID}" -k ProductVersion 2>/dev/null || echo "unknown")

info "ProductType: ${DEVICE_PRODUCT}"
info "iOS Version: ${DEVICE_VERSION}"

if [ "${DEVICE_PRODUCT}" != "iPhone7,2" ]; then
  warn "Expected iPhone7,2 but got ${DEVICE_PRODUCT} — continuing anyway"
fi

# ── 2. SSH key check ───────────────────────────────────────────────

if [ ! -f "$SSH_KEY" ]; then
  warn "SSH key not found at ${SSH_KEY}"
  warn "Generate one with: ssh-keygen -t ed25519 -f ${SSH_KEY} -N \"\" -C \"ios-automation\""
  warn "Then copy it to the device:"
  echo ""
  echo "  iproxy ${SSH_LOCAL_PORT}:22 -u ${DEVICE_UDID} &"
  echo "  ssh-copy-id -i ${SSH_KEY}.pub -p ${SSH_LOCAL_PORT} root@127.0.0.1"
  echo ""
  err "SSH key is required — cannot continue without passwordless SSH."
  exit 1
fi

# ── 3. Start SSH tunnel ────────────────────────────────────────────

log "Starting SSH tunnel (localhost:${SSH_LOCAL_PORT} → device:22)…"

# Kill stale iproxy on our port
if lsof -ti ":${SSH_LOCAL_PORT}" >/dev/null 2>&1; then
  info "Killing stale iproxy on port ${SSH_LOCAL_PORT}…"
  kill "$(lsof -ti ":${SSH_LOCAL_PORT}")" 2>/dev/null || true
  sleep 1
fi

iproxy "${SSH_LOCAL_PORT}:22" -u "${DEVICE_UDID}" > /dev/null 2>&1 &
IPROXY_SSH_PID=$!
sleep 2

if lsof -ti ":${SSH_LOCAL_PORT}" > /dev/null 2>&1; then
  log "SSH tunnel: localhost:${SSH_LOCAL_PORT} → device:22 ✓"
else
  err "SSH tunnel failed to start on port ${SSH_LOCAL_PORT}"
  exit 1
fi

# ── 4. Verify SSH connectivity ─────────────────────────────────────

log "Verifying SSH connectivity…"

# Build SSH command template — user gets set per attempt
build_ssh_cmd() {
  local user="$1"
  echo "ssh -i ${SSH_KEY} \
    -o BatchMode=yes \
    -o ConnectTimeout=5 \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    -o PasswordAuthentication=no \
    -o LogLevel=ERROR \
    -p ${SSH_LOCAL_PORT} ${user}@127.0.0.1"
}

try_ssh() {
  local user="$1"
  local cmd
  cmd=$(build_ssh_cmd "$user")
  eval "${cmd} \"echo OK\"" 2>/dev/null || true
}

# Try primary user with key-based auth
SSH_RESULT=$(try_ssh "$SSH_USER")
if [ "$SSH_RESULT" = "OK" ]; then
  log "SSH passwordless login as ${SSH_USER}: OK ✓"
elif [ -n "$SSH_FALLBACK_USER" ] && [ "$SSH_FALLBACK_USER" != "$SSH_USER" ]; then
  # Try fallback user
  warn "SSH as ${SSH_USER} failed — trying ${SSH_FALLBACK_USER}…"
  SSH_FB_RESULT=$(try_ssh "$SSH_FALLBACK_USER")
  if [ "$SSH_FB_RESULT" = "OK" ]; then
    log "SSH passwordless login as ${SSH_FALLBACK_USER}: OK ✓"
    SSH_USER="$SSH_FALLBACK_USER"
  else
    warn "SSH passwordless login FAILED for both ${SSH_USER} and ${SSH_FALLBACK_USER}"
    warn "  Manually copy the key, then re-run this script:"
    echo ""
    echo "  ssh-copy-id -i ${SSH_KEY}.pub -p ${SSH_LOCAL_PORT} root@127.0.0.1"
    echo ""
    warn "  Continuing — SMServer start will be attempted but may fail."
  fi
else
  warn "SSH passwordless login FAILED"
  warn "  Manually copy the key, then re-run this script:"
  echo ""
  echo "  ssh-copy-id -i ${SSH_KEY}.pub -p ${SSH_LOCAL_PORT} root@127.0.0.1"
  echo ""
  warn "  Continuing — SMServer start will be attempted but may fail."
fi

# Rebuild SSH_CMD_BASE with the resolved user
SSH_CMD_BASE=$(build_ssh_cmd "$SSH_USER")

# ── 5. Check SMServer installation ─────────────────────────────────

log "Checking SMServer installation on device…"

SMSERVER_CHECK=$(eval "${SSH_CMD_BASE} \"test -d ${SMSERVER_PATH} && echo installed || echo missing\"" 2>/dev/null || echo "ssh_failed")
if [ "$SMSERVER_CHECK" = "missing" ]; then
  err "SMServer not found at ${SMSERVER_PATH}"
  err "  Install SMServer12 for iOS 12 and try again."
  exit 1
elif [ "$SMSERVER_CHECK" = "ssh_failed" ]; then
  warn "SSH not working — cannot verify SMServer installation"
  warn "  Once SSH is set up, verify manually:"
  echo ""
  echo "  ssh -i ${SSH_KEY} -p ${SSH_LOCAL_PORT} root@127.0.0.1 \"test -d ${SMSERVER_PATH}\""
  echo ""
  warn "  Then re-run this script."
  info "SSH tunnel is running on port ${SSH_LOCAL_PORT} — use it to copy your key first:"
  info "  ssh-copy-id -i ${SSH_KEY}.pub -p ${SSH_LOCAL_PORT} root@127.0.0.1"
  info ""
  info "SMServer HTTP tunnel NOT started (needs SSH for device-side launch)."
  info "Run this script again after installing the SSH key."
  exit 1
fi
log "SMServer found at ${SMSERVER_PATH} ✓"

# ── 6. Start SMServer on the device ────────────────────────────────

log "Starting SMServer on the device…"

# Kill any existing SMServer, wrappers, and tail processes.
# Must kill ALL wrappers — old ones keep retrying and compete for port 8080.
# NOTE: iOS 12 lacks 'awk', use 'cut' and 'while read' instead.
eval "${SSH_CMD_BASE} \"killall -9 SMServer12 2>/dev/null || true\"" 2>/dev/null || true
eval "${SSH_CMD_BASE} \"ps ax 2>/dev/null | grep -v grep | grep -E 'run-smserver|tail -f /dev/null' | while read -r pid rest; do kill -9 \\\$pid 2>/dev/null || true; done\"" 2>/dev/null || true
sleep 2

# Write a wrapper script that keeps SMServer alive indefinitely.
# SMServer reads stdin waiting for 'q' to quit — without stdin it exits
# immediately. We pipe 'tail -f /dev/null' to keep stdin open forever.
# The -b (background) flag is NOT used because it requires IPC permissions
# unavailable on iOS 12. The wrapper loop restarts SMServer if it crashes.
#
# Build the script locally (with variables expanded) and pipe through SSH.
WRAPPER_SCRIPT=$(cat << HEREDOC_END
#!/bin/sh
cd ${SMSERVER_PATH}
rm -f ${SMSERVER_LOG}
while true; do
  echo "[\$(date)] Starting SMServer..." >> ${SMSERVER_LOG}
  tail -f /dev/null 2>/dev/null | ./SMServer12 ${SMSERVER_ARGS} >> ${SMSERVER_LOG} 2>&1
  echo "[\$(date)] SMServer exited with code \$?" >> ${SMSERVER_LOG}
  sleep 2
done
HEREDOC_END
)

echo "${WRAPPER_SCRIPT}" | ssh -i "${SSH_KEY}" \
    -o BatchMode=yes \
    -o ConnectTimeout=5 \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    -o PasswordAuthentication=no \
    -o LogLevel=ERROR \
    -p "${SSH_LOCAL_PORT}" "${SSH_USER}@127.0.0.1" \
    "cat > /tmp/run-smserver.sh && chmod +x /tmp/run-smserver.sh" 2>/dev/null

log "Wrapper script written to /tmp/run-smserver.sh"

# Launch the wrapper with nohup so it survives SSH session exit
eval "${SSH_CMD_BASE} \"nohup /tmp/run-smserver.sh > /dev/null 2>&1 &\"" 2>/dev/null

# Initialize status variables (needed because set -u)
SMSERVER_RUNNING=""
SMSERVER_PID=""

# Wait for SMServer — wrapper retries every 2s.
# iOS 12 lacks awk/pgrep, so we wait a fixed time and validate via HTTP later.
log "Waiting for SMServer to start (wrapper retries every 2s)…"
sleep 10  # Give wrapper 3-4 retry cycles

# ── 7. Start SMServer HTTP tunnel ──────────────────────────────────

log "Starting SMServer HTTP tunnel (localhost:${SMSERVER_LOCAL_HTTP_PORT} → device:${SMSERVER_DEVICE_HTTP_PORT})…"

# Kill stale iproxy on our port
if lsof -ti ":${SMSERVER_LOCAL_HTTP_PORT}" >/dev/null 2>&1; then
  info "Killing stale iproxy on port ${SMSERVER_LOCAL_HTTP_PORT}…"
  kill "$(lsof -ti ":${SMSERVER_LOCAL_HTTP_PORT}")" 2>/dev/null || true
  sleep 1
fi

iproxy "${SMSERVER_LOCAL_HTTP_PORT}:${SMSERVER_DEVICE_HTTP_PORT}" -u "${DEVICE_UDID}" > /dev/null 2>&1 &
IPROXY_HTTP_PID=$!
sleep 2

if lsof -ti ":${SMSERVER_LOCAL_HTTP_PORT}" > /dev/null 2>&1; then
  log "HTTP tunnel: localhost:${SMSERVER_LOCAL_HTTP_PORT} → device:${SMSERVER_DEVICE_HTTP_PORT} ✓"
else
  err "HTTP tunnel failed to start on port ${SMSERVER_LOCAL_HTTP_PORT}"
  exit 1
fi

# ── 8. Start SMServer WebSocket tunnel ─────────────────────────────

log "Starting SMServer WebSocket tunnel (localhost:${SMSERVER_LOCAL_WS_PORT} → device:${SMSERVER_DEVICE_WS_PORT})…"

if lsof -ti ":${SMSERVER_LOCAL_WS_PORT}" >/dev/null 2>&1; then
  info "Killing stale iproxy on port ${SMSERVER_LOCAL_WS_PORT}…"
  kill "$(lsof -ti ":${SMSERVER_LOCAL_WS_PORT}")" 2>/dev/null || true
  sleep 1
fi

iproxy "${SMSERVER_LOCAL_WS_PORT}:${SMSERVER_DEVICE_WS_PORT}" -u "${DEVICE_UDID}" > /dev/null 2>&1 &
IPROXY_WS_PID=$!
sleep 2

if lsof -ti ":${SMSERVER_LOCAL_WS_PORT}" > /dev/null 2>&1; then
  log "WebSocket tunnel: localhost:${SMSERVER_LOCAL_WS_PORT} → device:${SMSERVER_DEVICE_WS_PORT} ✓"
else
  err "WebSocket tunnel failed to start on port ${SMSERVER_LOCAL_WS_PORT}"
  exit 1
fi

# ── 9. Validate SMServer HTTP connectivity ──────────────────────────

log "Validating SMServer HTTP connectivity…"

SMSERVER_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://localhost:${SMSERVER_LOCAL_HTTP_PORT}/" 2>/dev/null || echo "000")
SMSERVER_BODY=$(curl -s --connect-timeout 5 "http://localhost:${SMSERVER_LOCAL_HTTP_PORT}/" 2>/dev/null | head -c 500 || echo "")

if [ "$SMSERVER_HTTP_CODE" = "000" ]; then
  warn "SMServer did not respond to HTTP request"
  warn "  The tunnel is up but the device-side server may not be listening."
  warn "  Check manually: curl -v http://localhost:${SMSERVER_LOCAL_HTTP_PORT}/"
else
  log "SMServer HTTP status: ${SMSERVER_HTTP_CODE} ✓"

  # Show response preview
  if [ -n "$SMSERVER_BODY" ]; then
    info "Response preview (first 500 chars):"
    echo "${SMSERVER_BODY}" | while IFS= read -r bodyline; do
      info "  ${bodyline}"
    done
  fi

  # Try common SMServer endpoints
  info "Probing known SMServer endpoints…"
  for endpoint in "/" "/ping" "/status" "/send" "/messages" "/health"; do
    ENDPOINT_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "http://localhost:${SMSERVER_LOCAL_HTTP_PORT}${endpoint}" 2>/dev/null || echo "000")
    if [ "$ENDPOINT_CODE" != "000" ] && [ "$ENDPOINT_CODE" != "404" ]; then
      info "  ${endpoint} → ${ENDPOINT_CODE}"
    fi
  done
fi

# ── 10. Final validation summary ─────────────────────────────────────

echo ""
header "╔══════════════════════════════════════════════════════════╗"
header "║     SMS Phone Validation Report                         ║"
header "╠══════════════════════════════════════════════════════════╣"

# Device info validation
echo -e "${GREEN}  [✓] Device connected:   ${DEVICE_UDID}${NC}"
echo -e "${GREEN}  [✓] Product type:       ${DEVICE_PRODUCT}${NC}"
echo -e "${GREEN}  [✓] iOS version:        ${DEVICE_VERSION}${NC}"

# SSH validation
if lsof -ti ":${SSH_LOCAL_PORT}" > /dev/null 2>&1; then
  echo -e "${GREEN}  [✓] SSH tunnel:         localhost:${SSH_LOCAL_PORT} → device:22${NC}"
else
  echo -e "${RED}  [✗] SSH tunnel:         NOT RUNNING${NC}"
fi

# SMServer process validation — use HTTP response as definitive check
if [ "$SMSERVER_HTTP_CODE" != "000" ]; then
  echo -e "${GREEN}  [✓] SMServer process:   RUNNING (HTTP ${SMSERVER_HTTP_CODE})${NC}"
else
  echo -e "${RED}  [✗] SMServer process:   NOT RUNNING${NC}"
fi

# HTTP tunnel validation
if lsof -ti ":${SMSERVER_LOCAL_HTTP_PORT}" > /dev/null 2>&1; then
  echo -e "${GREEN}  [✓] HTTP tunnel:        localhost:${SMSERVER_LOCAL_HTTP_PORT} → device:${SMSERVER_DEVICE_HTTP_PORT}${NC}"
else
  echo -e "${RED}  [✗] HTTP tunnel:        NOT RUNNING${NC}"
fi

# WebSocket tunnel validation
if lsof -ti ":${SMSERVER_LOCAL_WS_PORT}" > /dev/null 2>&1; then
  echo -e "${GREEN}  [✓] WebSocket tunnel:   localhost:${SMSERVER_LOCAL_WS_PORT} → device:${SMSERVER_DEVICE_WS_PORT}${NC}"
else
  echo -e "${RED}  [✗] WebSocket tunnel:   NOT RUNNING${NC}"
fi

# HTTP response validation
if [ "$SMSERVER_HTTP_CODE" != "000" ]; then
  echo -e "${GREEN}  [✓] HTTP response:      ${SMSERVER_HTTP_CODE}${NC}"
else
  echo -e "${RED}  [✗] HTTP response:      NO RESPONSE${NC}"
fi

header "╚══════════════════════════════════════════════════════════╝"
echo ""

info "Access:"
info "  SSH:              ssh -i ${SSH_KEY} -p ${SSH_LOCAL_PORT} ${SSH_USER}@127.0.0.1"
info "  SMServer HTTP:    http://localhost:${SMSERVER_LOCAL_HTTP_PORT}/"
info "  SMServer WS:      ws://localhost:${SMSERVER_LOCAL_WS_PORT}/"
info "  Device log:       ssh -p ${SSH_LOCAL_PORT} ${SSH_USER}@127.0.0.1 'tail -f ${SMSERVER_LOG}'"
echo ""

info "Background processes:"
info "  iproxy (SSH):     PID ${IPROXY_SSH_PID}  (port ${SSH_LOCAL_PORT})"
info "  iproxy (HTTP):    PID ${IPROXY_HTTP_PID}  (port ${SMSERVER_LOCAL_HTTP_PORT})"
info "  iproxy (WS):      PID ${IPROXY_WS_PID}  (port ${SMSERVER_LOCAL_WS_PORT})"
echo ""
