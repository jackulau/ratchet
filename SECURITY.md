# Security policy

## Supported versions

Security fixes land on `main` and ship in the next release. Older releases are not patched separately.

## Reporting a vulnerability

Please report security problems privately rather than in a public issue.

1. Use GitHub's private reporting: open the [Security tab](https://github.com/jackulau/ratchet/security) and choose **Report a vulnerability**.
2. If that option is not available to you, contact the maintainer through the details on their [GitHub profile](https://github.com/jackulau) and ask for a private channel. Do not include the details of the problem in a public message.

Include what you can of the following:

- the affected command, MCP tool, or file
- the version or commit
- steps to reproduce, or a proof of concept
- what an attacker gains

You can expect an acknowledgement within a week. Once a fix is ready it is released together with a published advisory that credits you, unless you prefer otherwise.

## What counts

ratchet runs locally, talks to USB devices, parses firmware images from untrusted sources, and exposes destructive operations to AI agents over MCP. Reports in these areas are especially welcome:

- memory safety problems in the libusb FFI layer or the `unsafe` code around it
- crashes, hangs, or out-of-bounds access when parsing a crafted BIOS image, SFDP table, BSDL file, or capture file
- any way to make an MCP client write or erase a chip without the required `"confirm": true`
- any path where a destructive command runs against the mock backend, or reports success, without the user asking for that
- problems in `install.sh` or the release artifacts

A flash operation that fails on particular hardware is a bug rather than a vulnerability. Please file it as a normal [bug report](https://github.com/jackulau/ratchet/issues/new?template=bug_report.yml).
