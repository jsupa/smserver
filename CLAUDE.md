# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SMServer is a jailbroken iOS app that runs an HTTP/WebSocket server on an iPhone, exposing iMessages and SMS via a web interface and REST API. It has two components that must work in concert:

1. **SMServer app** (Swift/SwiftUI) — the main app serving HTTP and WebSocket
2. **libsmserver tweak** (Objective-C/Logos) — a Theos tweak that hooks into the Messages process via IPC to intercept messages

## Build Commands

### App (iOS .deb and .ipa)

```bash
./make.sh -n    # Generate TLS certificates (run once before first build)
./make.sh -d    # Build .deb package
./make.sh -i    # Build .ipa package
./make.sh -m    # Minify HTML/CSS assets
./make.sh -l    # Build for iOS 12 and lower
```

CocoaPods must be installed and pods must be set up before building:
```bash
cd src && pod install
```

Build requires: Xcode 12+, CocoaPods, OpenSSL, dpkg, ldid.

### libsmserver Tweak (.deb)

```bash
cd libsmserver
make package FINALPACKAGE=1 THEOS_PACKAGE_SCHEME=rootless
```

Requires Theos installed and libMRYIPC headers/dylib available. The CI workflow downloads libMRYIPC from the MRYIPC GitHub repo.

### CI/CD

Two GitHub Actions workflows trigger on `v*` tags or manual dispatch:
- `.github/workflows/build-deb.yml` — builds libsmserver rootless .deb on Ubuntu
- `.github/workflows/build-app-deb.yml` — builds the SMServer app .deb on macOS 14

## Architecture

### Communication Flow

```
Web browser / remote client
        ↓ HTTP / WebSocket
  ServerDelegate (Criollo HTTP server)
        ↓ method calls
  ChatDelegate  ←→  IPC (libMRYIPC)  ←→  libsmserver tweak
                                                ↓ Logos hooks
                                          MobileSMS process (Messages.app)
```

### Key Source Files

| File | Role |
|------|------|
| `src/SMServer/shared/ServerDelegate.swift` | HTTP server setup, all API route handlers, WebSocket management, TLS |
| `src/SMServer/shared/ChatDelegate.swift` | All database/IPC access — loads messages, chats, attachments via libMRYIPC |
| `src/SMServer/shared/SocketDelegate.swift` | WebSocket server for real-time push (new messages, typing, read receipts) |
| `src/SMServer/shared/StarscreamDelegate.swift` | Outbound WebSocket to a remote relay server |
| `src/SMServer/shared/Settings.swift` | Singleton config — password, ports, themes, authenticated IPs, CLI arg parsing |
| `src/SMServer/shared/Constants.swift` | API endpoint strings, CLI arg names, DB paths, utility functions |
| `src/SMServer/ios/entry.swift` | App entry point — dual-mode: CLI args → headless server, else SwiftUI |
| `src/SMServer/ios/ContentView.swift` | SwiftUI main view (server control UI) |
| `libsmserver/Tweak.xm` | Logos hooks into MobileSMS; sends IPC notifications to the app |

### Platform Differences

`Constants.swift` abstracts iOS vs macOS differences (database paths, private framework availability). The `ios/` directory is iOS-only SwiftUI; `mac/main.swift` is the macOS CLI entry point. Shared logic in `shared/` compiles for both targets.

### Private Frameworks

`ChatDelegate.swift` relies on private Apple frameworks (`IMCore`, `ChatKit`, `AddressBook`) that are unavailable in the simulator — the app must run on a real jailbroken device. Database paths are hardcoded iOS system paths.

### Web Interface

Static files in `src/SMServer/html/` are bundled into the app and served directly by `ServerDelegate`. JavaScript communicates with the server via `/requests` (REST) and a WebSocket for real-time updates.

## Dependencies

- **Telegraph** — WebSocket/HTTP framework (CocoaPods)
- **Criollo** — HTTP server (custom podspec at `src/Criollo.podspec`)
- **Starscream ~4.0.0** — WebSocket client for remote relay
- **libMRYIPC** — IPC library (must be installed on device; not in CocoaPods)

## Rootless Jailbreak Notes

The CI builds target rootless jailbreaks (iOS 16+, arm64e). Key differences from rootful:
- Install prefix: `/var/jb` instead of `/`
- Entitlements file: `src/app.entitlements` is patched with rootless capabilities
- The `postinst`/`postrm` scripts in the app .deb handle `uicache` and service restart

## No Test Suite

There are no automated tests. Validation is build-success only in CI. Testing requires a physical jailbroken device.
