# WSON8 BIOS recovery with CH341A or CH347

ratchet can read, back up, analyze, write, and verify SPI flash through CH341A or CH347 USB programmers. This guide covers connecting a **WSON8 / WSON-8 BIOS chip** and establishing trustworthy reads before attempting firmware recovery. Reflashing can address corrupt BIOS / UEFI firmware; it cannot repair a shorted power rail, damaged component, or every motherboard that will not boot.

## WSON8 probe or SOIC-8 clip?

A SOIC-8 chip has exposed legs that a spring clip can grip. WSON8 is a leadless package with pads underneath: an ordinary SOIC-8 clip is unsuitable. Use a WSON probe matched to the package and accessible contact points, or an appropriate socket / soldered breakout after desoldering. Pad access on the assembled board matters; a probe is not guaranteed to contact every WSON footprint.

Check the **full chip part number, package drawing, body dimensions, pad spacing, and pin-1 orientation** against the probe or socket specifications. An adapter sold as “WSON8” is not automatically the right size or pinout. A secure fixture is preferable to holding a probe by hand for a long operation. The [MrChromebox CH341A unbricking guide](https://docs.mrchromebox.tech/docs/support/unbricking/unbrick-ch341a) illustrates SOIC clips and WSON-8 probes for ChromeOS hardware; its board-specific firmware steps should be followed for those devices.

## WSON8 does not tell you the voltage

Package and voltage are separate properties. Read the manufacturer's datasheet for the exact suffix, not just a family name such as `W25Q`. Confirm supply and input voltage limits, pin assignments, and any exposed-pad requirements.

Check the programmer and adapter before connecting the target. Measure supply voltage and confirm the SPI signal levels are within the chip's specifications; a correct VCC reading alone does not establish safe data-line levels. Use suitable measurement equipment for switching signals. A 1.8 V chip needs an appropriate supply and level shifting, not merely a mechanically compatible probe.

Some CH341A boards have 3.3 V at the socket but drive signals close to 5 V. See [flashrom's CH341A/B hardware documentation](https://flashrom.org/supported_hw/supported_prog/ch341ab.html). `ratchet voltage-reference <jedec-id>` reports the rated voltage from the database; software cannot measure or correct the electrical levels of your adapter.

## Install and prepare

Follow ratchet's [source installation instructions](../README.md#install) and [system requirements](../README.md#requirements): Rust 1.88+, libusb, and its build dependencies. macOS uses Homebrew libusb; Debian / Ubuntu uses libusb development headers and USB access permissions. Windows prerequisites are documented, but the repository's automated CI covers Linux and macOS only.

Disconnect external power and the board's batteries according to its service instructions. Identify the BIOS SPI flash rather than an unrelated EEPROM or embedded-controller firmware chip. Check pin 1 and wiring before powering the programmer. In-circuit reads can fail because the programmer powers other circuitry or another device contends for the SPI bus; flashrom explains these limits in its [in-system programming documentation](https://flashrom.org/user_docs/in_system.html). Escalate to an isolated connection or a desoldered chip when the board prevents reliable access.

## Get stable, matching backups before writing

```bash
ratchet status
ratchet identify
ratchet monitor --samples 20 --interval-ms 100
ratchet read original.bin
ratchet read original-check.bin
cmp original.bin original-check.bin
ratchet analyze original.bin
```

Require a stable, plausible JEDEC identification that matches the physical chip, matching full-length dumps, and an explanation for any all-zero or all-FF output. A stable ID is only a connection check; it does not prove that an entire dump is valid. Copy the original backup somewhere separate and associate it with this board.

On the **CH341A backend**, reads persist completed chunks and wait for contact to return. For short contact windows, the CLI exposes smaller read transactions and a longer wait:

```bash
ratchet read original.bin --chunk-kb 16 --patience 300
```

Choose the chunk size before starting: changing it restarts the dump because the saved progress records the stride. Retry the same output file to resume a compatible interrupted read. These features help recover from intermittent contact; they do not make incorrect wiring or voltage safe. Stabilize the connection before writing.

## Prepare the image, write, and verify

Use a raw SPI image prepared for the exact board and revision. A vendor download may contain a capsule, headers, or only one firmware region. File size alone cannot establish compatibility. Preserve required board data such as identifiers, MAC addresses, and firmware regions; ratchet's analysis is an inspection aid, not an automatic conversion of every vendor update into a safe full-chip image. Chromebook recovery can require region-specific flashrom commands and VPD / HWID preservation; consult the MrChromebox guide instead of substituting a generic whole-image write.

Only after the image and backups are checked:

```bash
ratchet write prepared-image.bin
ratchet verify prepared-image.bin
```

Require the independent `verify` command to succeed before reconnecting board power. Default writes perform a backup and read-back verification unless explicitly skipped.

CH341A writes work in blocks, retry erase/program/verify within the patience budget, and skip blocks already matching the target when rerun. Its automatic backup uses a stable chip-ID-and-size path so an interrupted write does not overwrite the original with partially programmed contents. That key does not uniquely identify a physical board: keep your separate board-specific backup and inspect the reported path.

CH347 uses sector erase, page programming, and final read-back verification; the CH341A contact-wait and block-resume behavior should not be assumed for CH347. Inspect `verified` in write output and run the independent `verify` command. If writing fails, keep the target off: an affected block may be erased or only partly programmed. A saved dump is useful evidence and a restoration source, but corrupt original firmware is not necessarily a bootable recovery image.

ratchet's automated protocol tests use emulated hardware; this guide does not claim verification on every WSON8 chip, probe, programmer, or motherboard. See [current hardware status](../README.md#status) and the [project overview](https://jacklau.dev/blog/ratchet/).
