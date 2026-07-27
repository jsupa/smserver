# Installation Guide — SMServer12 on iOS 12

## Prerequisites

- Jailbroken iPhone with iOS 12.x
- SSH access (`mobile` or `root`)
- `iproxy` on Mac (via `libimobiledevice`) for USB tunneling

## Install from .deb

1. Copy the `.deb` to the device:
   ```bash
   scp -P 2222 SMServer12.deb mobile@127.0.0.1:/tmp/
   ```

2. SSH in and install:
   ```bash
   ssh -p 2222 mobile@127.0.0.1
   sudo su
   dpkg -i /tmp/SMServer12.deb
   ```

3. Fix the post-install (it checks wrong path):
   ```bash
   mkdir -p /Applications/SMServer.app
   touch /Applications/SMServer.app/SMServer
   dpkg --configure com.ianwelker.smserver
   ```

4. Copy certs to the correct app directory:
   ```bash
   cp /Applications/SMServer.app/cert.der /Applications/SMServer12.app/
   cp /Applications/SMServer.app/identity.pfx /Applications/SMServer12.app/
   cp /Applications/SMServer.app/smserver_cert_pass.txt /Applications/SMServer12.app/
   ```

## USB Tunneling (iproxy)

SSH tunnel:
```bash
iproxy 2222 22
```

SMServer web tunnel:
```bash
iproxy 8080 8080
```

Then access at `http://127.0.0.1:8080` on your Mac.

## Daemonizing SMServer (Keep It Running)

SMServer exits when stdin closes (it waits for 'q' to quit). The `-b` (background) flag doesn't work on iOS 12 — it requires IPC permissions that fail with `MRYIPCCenter` errors.

### Solution: Wrapper Script

The `setup-sms-phone.sh` script writes a wrapper to `/tmp/run-smserver.sh`:

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

**Key trick:** `tail -f /dev/null |` keeps stdin open indefinitely. `tail -f` blocks forever waiting for changes to `/dev/null` (which never happen), so SMServer's stdin never gets EOF. SMServer stays alive even after the SSH session disconnects.

Launch it with `nohup`:
```bash
nohup /tmp/run-smserver.sh > /dev/null 2>&1 &
```

### Why `-b` Doesn't Work on iOS 12

The built-in `--background` flag uses `MRYIPCCenter` for IPC, which iOS 12 sandboxes reject:
```
WARNING: Failed to add selector for MRYIPCCenter: _addTargetMethod:forSelector:
  Failed to create server receive port: Permission denied
ERROR: SMServer failed to start.
```

The `tail -f /dev/null |` approach is the workaround.

## iOS 12 Limitations

| Tool | Available? | Notes |
|------|:---:|-------|
| `awk` | No | Use `cut` or `sed` instead |
| `pgrep` | No | Use `ps \| grep` |
| `lsof` | Path-dependent | May need full path `/usr/sbin/lsof` |
| `netstat` | No | No network stats |
| `nc` | No | No netcat |
| `curl` | No | Test from Mac through iproxy |
| `python` | No | No scripting runtime |
| `/dev/tcp` | No (zsh) | Bash feature, zsh on iOS doesn't support |
