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

---

# Debug Journey — SMServer on iOS 16.7.16 (Rootless / palera1n)

Device: iPhone 8 (`iPhone10,4`), iOS 16.7.16, palera1n rootless, ElleKit.

## Problem 1: Read-Only Filesystem on iOS 16
Installing `SMServer12.deb` directly failed:
```
dpkg: error: cannot write to /Applications: Read-only file system
```
**Root cause:** iOS 16 uses Sealed System Volume (SSV). `/Applications/` is strictly read-only.
**Solution:** Repackaged app into `/var/jb/Applications/SMServer12.app/`.

## Problem 2: Hardcoded dylib Path (`libmryipc.dylib`)
On launch, dyld immediately crashed:
```
dyld: Library not loaded: /usr/lib/libmryipc.dylib
  Reason: tried: '/usr/lib/libmryipc.dylib' (no such file)
```
**Root cause:** The binary expected `/usr/lib/libmryipc.dylib` (rootful path). On rootless, libraries reside in `/var/jb/usr/lib/`.
**Solution:** 
1. Patched binary using `install_name_tool -change /usr/lib/libmryipc.dylib @rpath/libmryipc.dylib SMServer12`.
2. Packaged `com.muirey03.libmryipc` deb installing into `/var/jb/usr/lib/libmryipc.dylib`.

## Problem 3: MRYIPC Crash on API Calls (`Unknown service name`)
When requesting `/requests?chats` or marking messages as read:
```
*** Terminating app due to uncaught exception 'MRYIPCException',
reason: 'callExternalMethod:withArguments:completion: - Failed to lookup service port: Unknown service name'
libc++abi: terminating due to uncaught exception of type NSException
```
**Root cause:** SMServer queries SpringBoard for pinned chats and conversation actions via MRYIPC (`com.ianwelker.smserver`). This requires the `libsmserver.dylib` tweak injected into SpringBoard.
**Solution:** Compiled `com.janshai.libsmserver` for `arm64` rootless using Theos targeting iOS 16.0+ and installed it into `/var/jb/usr/lib/TweakInject/`.

## Problem 4: ElleKit Safe Mode Blocking Tweak Injection
Even after installing `libsmserver.deb`, SpringBoard did not load the tweak.
**Root cause:** `/var/mobile/.eksafemode` was present, causing ElleKit to load `MobileSafety.dylib` and disable all SpringBoard tweaks.
**Solution:** Removed `/var/mobile/.eksafemode` and respang SpringBoard (`killall -9 SpringBoard`). `lsof` confirmed `libsmserver.dylib` loaded into `SpringBoard` and `MobileSMS`.

## Problem 5: Safe Mode Crash on Message Sending (`NSTask` calling `/bin/sh`)
When a message was sent via `POST /send`, the phone immediately crashed SpringBoard into ElleKit Safe Mode (`/var/mobile/.eksafemode`).
**Crash Report:** `/var/mobile/Library/Logs/CrashReporter/SpringBoard-*.ips`
```
Exception Type: EXC_CRASH (SIGABRT)
Application Specific Information:
abort() called
terminating with uncaught exception of type NSException
-[NSConcreteTask launchWithDictionary:error:]: launch path /bin/sh does not exist
```
**Root cause:** When `POST /send` fired, IMCore triggered `__kIMChatItemsDidChangeNotification`. SpringBoard's observer in `libsmserver` (`itemsChanged:`) called `-[SMServerIPC checkIfRunning:@"SMServer"]`. That method used `NSTask` to run `/bin/sh -c "ps aux | grep SMServer"`. On iOS 16 rootless, `/bin/sh` does NOT exist (it is at `/var/jb/bin/sh`), causing an uncaught exception in SpringBoard's main runloop that killed SpringBoard.
**Solution:** Replaced `NSTask` invocation in `libsmserver/Tweak.xm` with native BSD `sysctl(CTL_KERN, KERN_PROC, KERN_PROC_ALL)` process enumeration in memory. Wrapped notification handlers and IPC methods in `@try / @catch` blocks.

## Problem 6: IMCore Chat Capabilities on iOS 16 (`processCapabilities`)
Even after fixing the crash, messages did not send and logs showed:
```
SpringBoard(IMCore): Attempting a chat cache lookup without chats capability, returning early with 0 cache results only
```
**Root cause:** On iOS 16, `imagent` permission checking migrated from `- (unsigned)_capabilities` to `- (unsigned long long)processCapabilities`. Because `libsmserver` only hooked `_capabilities`, SpringBoard was denied full IMCore chat permissions.
**Solution:** In `libsmserver/Tweak.xm`, hooked `- (unsigned long long)processCapabilities` on `IMDaemonController` to return `4485895ULL` for SpringBoard, MobileSMS, and SMServer. Also updated `sendText:` to properly select connected accounts and target IMChat. Rebuilt and redeployed `com.janshai.libsmserver_0.9.1_iphoneos-arm64.deb`.


