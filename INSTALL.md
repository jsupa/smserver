# Installation Guide — SMServer

This guide covers installing and running SMServer on both **iOS 16 (Rootless)** and **iOS 12 (Legacy / Rootful)**.

---

## 1. Installation on iOS 16 (Rootless / palera1n / Dopamine)

Tested on iPhone 8 (`iPhone10,4`) running iOS 16.7.16 with **palera1n rootless**.

### Prerequisites

* Jailbroken iPhone on iOS 16.x (rootless bootstrap, e.g. palera1n or Dopamine)
* **ElleKit** installed (provides tweak injection on rootless)
* **OpenSSH** installed on device
* Mac with `libimobiledevice` (`iproxy`, `ideviceinfo`)
* Sudo password on device (default `0000` or device password)

### Rootless Architecture & Components

On iOS 16 rootless, the root filesystem `/` is a Sealed System Volume (SSV) and is strictly **read-only**. Everything installs under `/var/jb/`.

SMServer on iOS 16 requires **three components**:

| Package / File | Target Location | Role |
|----------------|-----------------|------|
| `com.muirey03.libmryipc` | `/var/jb/usr/lib/libmryipc.dylib` | Rootless Mach IPC messaging library |
| `com.janshai.libsmserver` | `/var/jb/usr/lib/TweakInject/libsmserver.dylib` | Theos tweak hooked into `SpringBoard` & `MobileSMS` |
| `com.ianwelker.smserver12` | `/var/jb/Applications/SMServer12.app/` | Headless HTTP & WebSocket server binary |

> [!IMPORTANT]
> Without `libsmserver` loaded into SpringBoard, SMServer will crash with `MRYIPCException: Failed to lookup service port: Unknown service name` when attempting to read chats or send messages.

### Pre-built Packages

All packages are included in this repository under `packages-ios16-rootless/`:
* `com.muirey03.libmryipc_2.0.1_iphoneos-arm64.deb`
* `com.janshai.libsmserver_0.9.1_iphoneos-arm64.deb`
* `SMServer12_rootless.deb`

### Step-by-Step Installation

#### 1. Establish USB SSH Tunnel on Mac
```bash
# Start SSH tunnel (port 2225 -> device 22)
iproxy 2225 22 -u <UDID> &
```

#### 2. Copy Packages to Device
```bash
scp -P 2225 -i ~/.ssh/id_ed25519_ios packages-ios16-rootless/*.deb mobile@127.0.0.1:/var/mobile/
```

#### 3. Install Packages on Device via SSH
```bash
ssh -p 2225 -i ~/.ssh/id_ed25519_ios mobile@127.0.0.1
echo 0000 | sudo -S dpkg -i \
  /var/mobile/com.muirey03.libmryipc_2.0.1_iphoneos-arm64.deb \
  /var/mobile/com.janshai.libsmserver_0.9.1_iphoneos-arm64.deb \
  /var/mobile/SMServer12_rootless.deb
rm -f /var/mobile/*.deb
```

#### 4. Disable ElleKit Safe Mode & Respring
ElleKit will disable SpringBoard tweak injection if `.eksafemode` is present. Ensure it is removed and restart SpringBoard:
```bash
rm -f /var/mobile/.eksafemode
echo 0000 | sudo -S killall -9 SpringBoard
```

Wait ~3 seconds for SpringBoard to reload. Verify `libsmserver.dylib` is loaded:
```bash
echo 0000 | sudo -S /var/jb/usr/sbin/lsof | grep -i libsmserver
```
You should see both `SpringBoard` and `MobileSMS` holding open `libsmserver.dylib`.

#### 5. Open Messages App (Warm-up)
Launch MobileSMS once to initialize the SMS/iMessage daemon connections:
```bash
uiopen sms://
```

#### 6. Configure Daemon Runner Script
Create `/var/mobile/run-smserver.sh` to keep SMServer alive and auto-restart on crashes:
```bash
cat << 'EOF' > /var/mobile/run-smserver.sh
#!/bin/sh
cd /var/jb/Applications/SMServer12.app
rm -f /tmp/smserver.log
while true; do
  echo "[$(date)] Starting SMServer..." >> /tmp/smserver.log
  tail -f /dev/null 2>/dev/null | ./SMServer12 --no_secure --no_authentication --server_port 8080 --socket_port 8081 --debug >> /tmp/smserver.log 2>&1
  echo "[$(date)] SMServer exited with code $?" >> /tmp/smserver.log
  sleep 2
done
EOF
chmod +x /var/mobile/run-smserver.sh

# Start the background daemon
nohup /var/mobile/run-smserver.sh > /dev/null 2>&1 &
```

#### 7. Forward HTTP and WebSocket Ports on Mac
```bash
# HTTP Web UI & REST API
iproxy 8085 8080 -u <UDID> &

# WebSocket Real-Time Updates
iproxy 8081 8081 -u <UDID> &
```

#### 8. Verify
* Web UI: Open [http://localhost:8085](http://localhost:8085)
* REST API:
  ```bash
  curl http://localhost:8085/requests?chats
  ```

---

## 2. Installation on iOS 12 (Legacy / Rootful)

Tested on iPhone 6 (`iPhone7,2`) running iOS 12.5.8.

### Prerequisites

* Jailbroken iPhone on iOS 12.x (unc0ver, checkra1n)
* SSH access (`mobile` or `root`)
* `iproxy` on Mac via `libimobiledevice`

### Install from .deb

1. Copy `SMServer12.deb` to the device:
   ```bash
   scp -P 2225 SMServer12.deb mobile@127.0.0.1:/tmp/
   ```

2. SSH in and install:
   ```bash
   ssh -p 2225 mobile@127.0.0.1
   sudo su
   dpkg -i /tmp/SMServer12.deb
   ```

3. Fix the post-install (checks old path):
   ```bash
   mkdir -p /Applications/SMServer.app
   touch /Applications/SMServer.app/SMServer
   dpkg --configure com.ianwelker.smserver
   ```

4. Copy TLS certs:
   ```bash
   cp /Applications/SMServer.app/cert.der /Applications/SMServer12.app/
   cp /Applications/SMServer.app/identity.pfx /Applications/SMServer12.app/
   cp /Applications/SMServer.app/smserver_cert_pass.txt /Applications/SMServer12.app/
   ```

### Daemonizing SMServer on iOS 12

SMServer exits when stdin closes (it waits for 'q' to quit). The `-b` (background) flag does not work on iOS 12 due to sandbox limitations (`MRYIPCCenter` errors).

The wrapper script at `/tmp/run-smserver.sh` uses `tail -f /dev/null |` to keep stdin open:

```sh
#!/bin/sh
cd /Applications/SMServer12.app
rm -f /tmp/smserver.log
while true; do
  echo "[$(date)] Starting SMServer..." >> /tmp/smserver.log
  tail -f /dev/null 2>/dev/null | ./SMServer12 --no_secure --no_authentication --server_port 8080 --socket_port 8081 --debug >> /tmp/smserver.log 2>&1
  echo "[$(date)] SMServer exited with code $?" >> /tmp/smserver.log
  sleep 2
done
```

Launch with:
```bash
nohup /tmp/run-smserver.sh > /dev/null 2>&1 &
```

---

## Troubleshooting & Key Differences

| Issue | Cause on iOS 16 Rootless | Solution |
|-------|--------------------------|----------|
| `dpkg: error: Read-only file system` | Trying to install into `/Applications/` | Install rootless package into `/var/jb/Applications/` |
| `MRYIPCException: Unknown service name` | `libsmserver.dylib` not active in SpringBoard | Remove `/var/mobile/.eksafemode`, `killall -9 SpringBoard`, run `uiopen sms://` |
| `dyld: Library not loaded: /usr/lib/libmryipc.dylib` | Binary hardcoded `/usr/lib/` path | Use `SMServer12_rootless.deb` (patched with `@rpath/libmryipc.dylib`) |
| `EXIT=137` / Killed by AMFI | Binary missing rootless entitlements or outside `/var/jb` | Sign with `ldid -Ssrc/app.entitlements` and place under `/var/jb/` |
| CLI commands missing in sudo (`lsof`, `dpkg`) | Rootless PATH not loaded by sudo | Use full paths: `/var/jb/usr/bin/dpkg`, `/var/jb/usr/sbin/lsof` |
