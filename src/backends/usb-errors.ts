const USB_DISCONNECT_PATTERNS = [
  "LIBUSB_ERROR_NO_DEVICE",
  "LIBUSB_ERROR_IO",
  "LIBUSB_ERROR_PIPE",
  "LIBUSB_ERROR_OVERFLOW",
  "LIBUSB_ERROR_TIMEOUT",
  "LIBUSB_TRANSFER_NO_DEVICE",
  "LIBUSB_TRANSFER_ERROR",
  "device has been disconnected",
  "ENODEV",
  "EIO",
];

export class UsbDisconnectError extends Error {
  constructor(originalMessage: string) {
    super(
      `USB programmer disconnected: ${originalMessage}\n\n` +
      `Troubleshooting:\n` +
      `  1. Check USB cable — reseat or try a different cable\n` +
      `  2. Try a different USB port (avoid hubs)\n` +
      `  3. If using SOIC clip — check clip is firmly seated\n` +
      `  4. Check for loose solder joints on programmer board\n` +
      `  5. Some USB ports have power limits — try a powered hub\n` +
      `  6. On Linux: check dmesg for USB errors`
    );
    this.name = "UsbDisconnectError";
  }
}

export function isUsbDisconnect(err: Error): boolean {
  const msg = err.message || "";
  return USB_DISCONNECT_PATTERNS.some(p => msg.includes(p));
}

export function wrapUsbError(err: Error): Error {
  if (isUsbDisconnect(err)) {
    return new UsbDisconnectError(err.message);
  }
  return err;
}
