# Debug Journey — SMServer12 on iOS 12.5.8

## Initial Problem

Installed SMServer 0.7.4 GUI version — instant crash on launch.

### Crash 1: CryptoKit missing

```
Termination Description: DYLD, Library not loaded:
/System/Library/Frameworks/CryptoKit.framework/CryptoKit
Reason: image not found
```

**Root cause:** CryptoKit is iOS 13+ only. iPhone 6 maxes out at iOS 12.5.8.

### Crash 2: SwiftUI also missing

Checked all pre-built releases (v0.5.0 through v0.8.0) — ALL link both:
- `SwiftUI.framework` (iOS 13+)
- `CryptoKit.framework` (iOS 13+)

Both are `LC_LOAD_DYLIB` (strongly linked) — impossible to run on iOS 12.

## Solution: SMServer12 CLI Build

Found official CLI-only build from [GitHub Issue #129](https://github.com/itsjunetime/smserver/issues/129). Strips out SwiftUI, replaces with CLI mode.

### How CLI Mode Works (from source)

```swift
// entry.swift
if CommandLine.argc > 1 {
    // CLI MODE — runs server directly
} else {
    _ = UIApplicationMain(...) // Crashes on iOS 12
}
```

Any argument triggers CLI mode. Running bare `./SMServer12` = crash.

### Crash 3: SIGABRT in UIKit

When launched from SpringBoard (icon tap): `Role: Foreground`, crashes in `GSEventRunModal`. No arguments passed -> UIApplicationMain path -> crash.

### Crash 4: SIGTRAP — force unwrap nil cert

```
SMServer_app: Got past adding all the handlers.
zsh: trace trap
```

**Root cause:** `SocketDelegate.swift` lines 12-13:

```swift
let cert = Certificate(derURL: (Bundle.main.url(forResource: "cert", withExtension: "der")!))
let identity = CertificateIdentity(p12URL: Bundle.main.url(forResource: "identity", withExtension: "pfx")!, ...)
```

Force unwrap crashes even with TLS disabled.

### Crash 5: TLS cert password mismatch

Post-install script generates new certs with random password, but binary has hardcoded password from `PKCS12Identity.pass`.

## Working Setup

```bash
# SSH into iPhone via USB
iproxy 2222 22
ssh -p 2222 mobile@127.0.0.1

# On iPhone
cd /Applications/SMServer12.app
./SMServer12 --no_secure --server_port 8080 --debug
```

```bash
# Tunnel web port on Mac
iproxy 8080 8080
# Open http://127.0.0.1:8080  (default password: toor)
```

## Key Files

| File | Purpose |
|------|---------|
| `/Applications/SMServer12.app/SMServer12` | CLI binary |
| `/Applications/SMServer12.app/cert.der` | TLS cert (must exist) |
| `/Applications/SMServer12.app/identity.pfx` | TLS identity (must exist) |
| `/Applications/SMServer12.app/smserver_cert_pass.txt` | Cert password (must exist) |
| `/Applications/SMServer.app/` | Postinst puts certs here (wrong) |
