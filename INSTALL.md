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
