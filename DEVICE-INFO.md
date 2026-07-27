# Getting Device Information

How to extract all info from a connected iPhone using `libimobiledevice`.

## Quick Summary

```bash
# List connected devices
idevice_id -l

# Full dump (all info)
ideviceinfo

# Specific fields
ideviceinfo -k ProductType        # e.g., iPhone7,2
ideviceinfo -k ProductVersion     # e.g., 12.5.8
ideviceinfo -k UniqueDeviceID     # UDID
ideviceinfo -k DeviceName         # e.g., iPhone
ideviceinfo -k SerialNumber       # e.g., C8QNVEUXG5MP
ideviceinfo -k HardwareModel      # e.g., N61AP
ideviceinfo -k ModelNumber        # e.g., MG482
ideviceinfo -k CPUArchitecture    # e.g., arm64
ideviceinfo -k BuildVersion       # e.g., 16H88
ideviceinfo -k WiFiAddress        # MAC address
ideviceinfo -k BluetoothAddress   # MAC address
ideviceinfo -k DeviceColor        # e.g., #e1e4e3
ideviceinfo -k UniqueChipID       # e.g., 1451819746250426
ideviceinfo -k SIMStatus          # SIM card status
ideviceinfo -k PasswordProtected  # true/false
ideviceinfo -k TimeZone           # e.g., Europe/Bratislava
```

## Key Fields Reference

| Field | Example | Description |
|-------|---------|-------------|
| `UniqueDeviceID` | `e5b2cc839...` | 40-char hex UDID |
| `ProductType` | `iPhone7,2` | Internal model identifier |
| `ProductVersion` | `12.5.8` | iOS version |
| `BuildVersion` | `16H88` | Exact build number |
| `HardwareModel` | `N61AP` | Board config |
| `CPUArchitecture` | `arm64` | 64-bit vs 32-bit |
| `DeviceClass` | `iPhone` | Device type |
| `SerialNumber` | `C8QNVEUXG5MP` | Apple serial number |
| `UniqueChipID` | `1451819746250426` | Processor serial |
| `WiFiAddress` | `48:e9:f1:...` | WiFi MAC |
| `ModelNumber` | `MG482` | Apple model number |
| `DeviceColor` | `#e1e4e3` | Shell color (hex) |
| `SIMStatus` | `kCTSIMSupportSIMStatusNotInserted` | SIM state |
| `PasswordProtected` | `false` | Has passcode? |

## Model Reference (iPhone)

| ProductType | Marketing Name | Max iOS | Arch |
|-------------|---------------|---------|------|
| `iPhone7,2` | iPhone 6 | 12.5.8 | arm64 |
| `iPhone8,1` | iPhone 6s | 15.8.8 | arm64 |
| `iPhone9,1` / `iPhone9,3` | iPhone 7 | 15.8.8 | arm64 |
| `iPhone10,1` / `iPhone10,4` | iPhone 8 | 16.7.16 | arm64 |

## Jailbreak Detection

Check if jailbroken:

```bash
# Via SSH — if you can connect as root, it's jailbroken
ssh -p 2222 root@127.0.0.1 "echo jailbroken"

# Check for common jailbreak files
ssh -p 2222 mobile@127.0.0.1 "ls /var/jb 2>/dev/null && echo rootless || echo 'no /var/jb'"
ssh -p 2222 mobile@127.0.0.1 "which Cydia 2>/dev/null || which Sileo 2>/dev/null || echo 'no package manager'"
```

## One-Liner Device Info Script

```bash
#!/bin/bash
# dump-device-info.sh — prints all key info for a connected device
UDID=$(idevice_id -l | head -1)
echo "UDID:        $(ideviceinfo -u "$UDID" -k UniqueDeviceID)"
echo "Name:        $(ideviceinfo -u "$UDID" -k DeviceName)"
echo "Product:     $(ideviceinfo -u "$UDID" -k ProductType)"
echo "Model:       $(ideviceinfo -u "$UDID" -k HardwareModel)"
echo "iOS:         $(ideviceinfo -u "$UDID" -k ProductVersion)"
echo "Build:       $(ideviceinfo -u "$UDID" -k BuildVersion)"
echo "Arch:        $(ideviceinfo -u "$UDID" -k CPUArchitecture)"
echo "Serial:      $(ideviceinfo -u "$UDID" -k SerialNumber)"
echo "ChipID:      $(ideviceinfo -u "$UDID" -k UniqueChipID)"
echo "Color:       $(ideviceinfo -u "$UDID" -k DeviceColor)"
echo "WiFi MAC:    $(ideviceinfo -u "$UDID" -k WiFiAddress)"
echo "BT MAC:      $(ideviceinfo -u "$UDID" -k BluetoothAddress)"
echo "SIM:         $(ideviceinfo -u "$UDID" -k SIMStatus)"
echo "Passcode:    $(ideviceinfo -u "$UDID" -k PasswordProtected)"
echo "Timezone:    $(ideviceinfo -u "$UDID" -k TimeZone)"
```
