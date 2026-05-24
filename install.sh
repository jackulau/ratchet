#!/usr/bin/env bash
# ratchet installer. Downloads the pre-built native binary for the host platform
# from GitHub Releases. No Node.js / npm required.
#
# Today there are no published releases. Until a release lands, install from
# source via `cargo install --path rust/ratchet-cli` (see README).

set -euo pipefail

REPO="jackulau/ratchet"
BIN="ratchet"
INSTALL_DIR="${RATCHET_INSTALL_DIR:-/usr/local/bin}"

echo ""
echo "  ratchet installer"
echo "  ════════════════"
echo ""

# ─── Detect platform ─────────────────────────────────────────────────────────

OS=""
ARCH=""
case "$(uname -s)" in
  Darwin) OS="apple-darwin" ;;
  Linux)  OS="unknown-linux-gnu" ;;
  MINGW*|MSYS*|CYGWIN*) OS="pc-windows-msvc" ;;
  *) echo "  ✗ Unsupported OS: $(uname -s)"; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) ARCH="x86_64" ;;
  arm64|aarch64) ARCH="aarch64" ;;
  *) echo "  ✗ Unsupported arch: $(uname -m)"; exit 1 ;;
esac
TARGET="${ARCH}-${OS}"
echo "  → Target: $TARGET"

# ─── Resolve latest release ──────────────────────────────────────────────────

if [ -z "${RATCHET_VERSION:-}" ]; then
  echo "  → Resolving latest release from GitHub..."
  TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
        | grep -oE '"tag_name":\s*"[^"]+"' | head -1 | sed 's/.*"\([^"]*\)"/\1/')
  if [ -z "$TAG" ]; then
    echo "  ✗ Could not resolve latest release (rate-limited or no releases yet)."
    echo "    Until a release ships, install from source:"
    echo "      git clone https://github.com/${REPO}"
    echo "      cd ratchet/rust && cargo install --path ratchet-cli"
    echo "    Or set RATCHET_VERSION=vX.Y.Z to pin a specific tag manually."
    exit 1
  fi
else
  TAG="$RATCHET_VERSION"
fi
echo "  → Version: $TAG"

# ─── Download + extract ──────────────────────────────────────────────────────

ASSET="ratchet-${TAG#v}-${TARGET}.tar.gz"
URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

echo "  → Downloading: $URL"
curl -fL "$URL" -o "$TMPDIR/$ASSET"

echo "  → Extracting..."
tar -xzf "$TMPDIR/$ASSET" -C "$TMPDIR"

# ─── Install ─────────────────────────────────────────────────────────────────

if [ ! -w "$INSTALL_DIR" ]; then
  echo "  ! $INSTALL_DIR not writable, falling back to ~/.local/bin"
  INSTALL_DIR="$HOME/.local/bin"
  mkdir -p "$INSTALL_DIR"
fi

for f in "$TMPDIR"/ratchet "$TMPDIR"/ratchet-mcp; do
  if [ -f "$f" ]; then
    chmod +x "$f"
    mv "$f" "$INSTALL_DIR/"
    echo "  ✓ Installed: $INSTALL_DIR/$(basename "$f")"
  fi
done

# ─── Platform-specific driver notes ──────────────────────────────────────────

echo ""
case "$OS" in
  apple-darwin)
    echo "  macOS: USB device access may require sudo or Full Disk Access."
    echo "         See: docs/macos-usb-permissions.md"
    ;;
  unknown-linux-gnu)
    echo "  Linux: install udev rule for CH34x:"
    echo "    sudo install -m 644 packaging/99-ratchet.rules /etc/udev/rules.d/"
    echo "    sudo udevadm control --reload-rules && sudo udevadm trigger"
    ;;
  pc-windows-msvc)
    echo "  Windows: install the WinUSB driver via Zadig: https://zadig.akeo.ie/"
    ;;
esac

echo ""
echo "  Ready. Plug in your CH341A or CH347 programmer and run:"
echo ""
echo "    ratchet status"
echo ""
echo "  Uninstall later with:"
echo "    rm -f $INSTALL_DIR/ratchet $INSTALL_DIR/ratchet-mcp"
echo ""
