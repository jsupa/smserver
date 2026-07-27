# Port Forwarding & Tunneling Guide

How to forward ports between your Mac and a jailbroken iPhone over USB.

## Prerequisites

```bash
# macOS
brew install libimobiledevice

# Linux
sudo apt install libimobiledevice-dev
```

## iproxy — USB Multiplexing

`iproxy` forwards TCP ports over the USB cable. No WiFi needed, no latency, works even when the device has no network.

```bash
# Syntax: iproxy <local_port> <device_port> [-u <udid>]
iproxy 2222 22           # Forward localhost:2222 → device:22 (SSH)
iproxy 8080 8080          # Forward localhost:8080 → device:8080
```

### Multiple Devices

When multiple iPhones are connected, specify the UDID:

```bash
idevice_id -l                                  # List connected UDIDs
iproxy 2225 22 -u e5b2cc8393e60b9a51ed5b59fcb111a942070734
```

### Kill Stale Tunnels

```bash
# Kill iproxy on a specific port
kill $(lsof -ti :2222)

# Kill all iproxy processes
pkill iproxy
```

## Common Tunnel Setups

### SSH Tunnel (always needed)

```bash
iproxy 2225 22 -u <udid> &
ssh -i ~/.ssh/id_ed25519_ios -p 2225 root@127.0.0.1
```

### SMServer HTTP + WebSocket

```bash
# HTTP web UI
iproxy 8085 8080 -u <udid> &

# WebSocket (MUST match device port — SMServer hardcodes this in JS)
iproxy 8081 8081 -u <udid> &

# Access: http://localhost:8085/
```

### Why WebSocket MUST match

SMServer's web UI JavaScript reads the current page URL and connects WebSocket to the **same host and port**:

```javascript
// From SMServer's index page:
socket_address = doc_url.split("/")[2].split(":")[0];
// WebSocket connects to ws://<socket_address>:<socket_port>/
```

The `socket_port` is set server-side. If you forward `8086→8081`, the browser tries `ws://localhost:8086/` but SMServer tells it `ws://localhost:8081/`. **Always use matching ports** for WebSocket.

## SSH Key Setup

Generate a dedicated key for iOS devices:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_ios -N "" -C "ios-automation"
```

Copy it to the device (iPhone must have SSH tunnel up first):

```bash
iproxy 2225 22 -u <udid> &
ssh-copy-id -i ~/.ssh/id_ed25519_ios.pub -p 2225 root@127.0.0.1
```

## WiFi vs USB

| | USB (iproxy) | WiFi |
|---|---|---|
| Speed | Fast | Variable |
| Reliability | Always works | WiFi must stay on |
| Device sleep | Survives | Drops connection |
| IP changes | N/A | DHCP lease renewals |
| Multiple devices | UDID-based | IP-based (confusing) |

**Always prefer USB/iproxy** for automation. WiFi is useful for quick manual access.

## Check What's Listening

On macOS (check local tunnels):
```bash
lsof -i -P -n | grep iproxy
```

On iPhone iOS 12 (limited — no `awk`, no `lsof` in default path):
```bash
# Best available check: just try to connect
echo > /dev/tcp/127.0.0.1/8080 2>&1 && echo "open" || echo "closed"
# Note: /dev/tcp may not work on all iOS shells
```

## Port Planning

When running multiple devices, plan port ranges to avoid conflicts:

| Device | SSH | HTTP | WS |
|--------|-----|------|----|
| iPhone 8 (#1) | 2222 | 8100 | — |
| iPhone 6s (#2) | 2223 | 8101 | — |
| iPhone 7 (#3) | 2224 | 8102 | — |
| iPhone 6 SMS | 2225 | 8085 | 8081 |

Check what's in use: `lsof -i -P -n | grep LISTEN | grep -E ':[0-9]+'`
