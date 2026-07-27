# SMServer12 — iOS 12 SMS Gateway

Run SMServer on a jailbroken iPhone 6 (iOS 12.5.8) as a persistent background service, accessible from your Mac over USB.

## Quick Start

```bash
./setup-sms-phone.sh
```

Then open **http://localhost:8085/** (default password: `toor`)

## What This Repo Contains

| File | Purpose |
|------|---------|
| `setup-sms-phone.sh` | One-shot script — SSH tunnel, launch SMServer daemon, HTTP+WS tunnels, validation |
| `INSTALL.md` | How to install SMServer12 from `.deb` on iOS 12 |
| `CLI.md` | Full CLI flag reference for SMServer12 |
| `TUNNELING.md` | Port forwarding guide — `iproxy`, USB, WiFi, SSH tunnels |
| `DEVICE-INFO.md` | How to get device info (UDID, iOS version, model, etc.) |
| `DEBUG.md` | Debug journey — all the crashes and how they were solved |
| `SMServer12.deb` | Pre-built CLI-only `.deb` for iOS 12 |

## Architecture

```
[Your Mac]                              [iPhone 6, iOS 12.5.8]
                                        
  Browser ──▶ localhost:8085 ── iproxy ──▶ device:8080 (HTTP)
       └──▶ localhost:8081 ── iproxy ──▶ device:8081 (WebSocket)
                                        
  Terminal ──▶ localhost:2225 ── iproxy ──▶ device:22 (SSH)
```

SMServer runs via a wrapper script (`/tmp/run-smserver.sh`) that keeps it alive:
- `tail -f /dev/null |` pipe keeps stdin open (SMServer exits on stdin EOF)
- Auto-restarts on crash (2s interval)
- `nohup` + daemon loop survives SSH disconnect

## Port Map

| Service | Mac (localhost) | iPhone | Purpose |
|---------|:---:|:---:|---------|
| SSH | 2225 | 22 | Terminal access |
| SMServer HTTP | 8085 | 8080 | Web UI + REST API |
| SMServer WebSocket | 8081 | 8081 | Real-time updates |

## Default Credentials

| Field | Default |
|-------|---------|
| SSH user | `root` |
| SMServer password | `toor` |
| SMServer auth | Disabled (`--no_authentication`) |
| SMServer TLS | Disabled (`--no_secure`) |

## Links

- [SMServer source](https://github.com/itsjunetime/smserver) — original project by [itsjunetime](https://github.com/itsjunetime)
- [iOS 12 compatibility issue](https://github.com/itsjunetime/smserver/issues/129) — where the CLI build came from
