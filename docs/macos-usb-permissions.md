# macOS USB access for ratchet

ratchet talks to CH341A / CH347 programmers through libusb. On macOS there is
no udev; access is governed by which kernel driver (if any) claims the device.

## Prerequisites

```sh
brew install libusb
```

ratchet links against the system `libusb-1.0` found via `pkg-config`.

## CH341A (1a86:5512)

In SPI/parallel programmer mode the CH341A exposes a vendor-specific interface
that no Apple driver claims, so libusb can open it directly. No configuration
needed — plug it in and run `ratchet detect`.

If the stick was flashed/jumpered into UART mode, Apple's USB serial driver
(`com.apple.DriverKit-AppleUSBSerial` on modern macOS) claims it and ratchet
cannot open the interface. Switch the jumper back to programmer (SPI) mode.

## CH347 (1a86:55db)

The CH347 is a composite device; its UART function may be claimed by the
serial driver while the SPI/I2C/JTAG interface (interface 2) stays free.
ratchet claims only interface 2, so both can coexist.

## Troubleshooting

- `access denied` from ratchet: another process holds the interface — close
  vendor tools (WCH demo apps) or other flashers and retry.
- `no CH341A or CH347 USB device detected`: check `system_profiler
  SPUSBDataType | grep -A4 -i "1a86"` to confirm enumeration; try a different
  cable/port (data-capable, not charge-only).
- Third-party CH34x kexts from old vendor installers can shadow the device.
  Remove them (`ls /Library/Extensions | grep -i ch34`) if detection fails
  where Linux works.
