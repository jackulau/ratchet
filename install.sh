#!/usr/bin/env bash
# ratchet installer. Downloads the pre-built native binaries for the host
# platform from GitHub Releases and verifies their checksum. No Node.js / npm
# required.
#
# Releases are built by .github/workflows/release.yml. Until the first release
# is tagged, install from source with `cargo install --path rust/ratchet-cli`
# (see README).
#
# Environment:
#   RATCHET_VERSION      tag to install (default: the newest release)
#   RATCHET_INSTALL_DIR  where to put the binaries (default: /usr/local/bin)

set -euo pipefail

REPO="jackulau/ratchet"
INSTALL_DIR="${RATCHET_INSTALL_DIR:-/usr/local/bin}"

echo ""
echo "  ratchet installer"
echo "  ════════════════"
echo ""

from_source() {
  echo "    Install from source instead:"
  echo "      git clone https://github.com/${REPO}"
  echo "      cd ratchet/rust && cargo install --path ratchet-cli"
}

# ─── Detect platform ─────────────────────────────────────────────────────────

OS=""
ARCH=""
case "$(uname -s)" in
  Darwin) OS="apple-darwin" ;;
  Linux)  OS="unknown-linux-gnu" ;;
  MINGW*|MSYS*|CYGWIN*)
    echo "  ✗ There are no pre-built Windows binaries yet."
    from_source
    exit 1
    ;;
  *) echo "  ✗ Unsupported OS: $(uname -s)"; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) ARCH="x86_64" ;;
  arm64|aarch64) ARCH="aarch64" ;;
  *) echo "  ✗ Unsupported arch: $(uname -m)"; exit 1 ;;
esac
TARGET="${ARCH}-${OS}"
echo "  → Target: $TARGET"

# ─── Resolve the release ─────────────────────────────────────────────────────

# Print the first "tag_name" in a GitHub API response, or nothing.
tag_from() {
  curl -fsSL "$1" 2>/dev/null \
    | grep -oE '"tag_name":[[:space:]]*"[^"]+"' | head -n 1 | sed 's/.*"\([^"]*\)"/\1/' || true
}

if [ -z "${RATCHET_VERSION:-}" ]; then
  echo "  → Resolving the newest release from GitHub..."
  # `releases/latest` skips pre-releases, so fall back to the newest release of
  # any kind while the project only has pre-releases.
  TAG="$(tag_from "https://api.github.com/repos/${REPO}/releases/latest")"
  if [ -z "$TAG" ]; then
    TAG="$(tag_from "https://api.github.com/repos/${REPO}/releases?per_page=1")"
  fi
  if [ -z "$TAG" ]; then
    echo "  ✗ Could not find a release (none published yet, or the GitHub API rate limit was hit)."
    from_source
    echo "    Or set RATCHET_VERSION=vX.Y.Z to pin a specific tag."
    exit 1
  fi
else
  TAG="$RATCHET_VERSION"
fi
echo "  → Version: $TAG"

# ─── Download, verify, extract ───────────────────────────────────────────────

ASSET="ratchet-${TAG#v}-${TARGET}.tar.gz"
BASE_URL="https://github.com/${REPO}/releases/download/${TAG}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "  → Downloading: $BASE_URL/$ASSET"
if ! curl -fL --progress-bar "$BASE_URL/$ASSET" -o "$WORK/$ASSET"; then
  echo "  ✗ Release $TAG has no build for $TARGET."
  from_source
  exit 1
fi

echo "  → Verifying checksum..."
if ! curl -fsSL "$BASE_URL/SHA256SUMS" -o "$WORK/SHA256SUMS"; then
  echo "  ✗ Release $TAG has no SHA256SUMS file; refusing to install an unverified download."
  exit 1
fi
EXPECTED="$(awk -v f="$ASSET" '$2 == f { print $1 }' "$WORK/SHA256SUMS")"
if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "$WORK/$ASSET" | awk '{ print $1 }')"
else
  ACTUAL="$(shasum -a 256 "$WORK/$ASSET" | awk '{ print $1 }')"
fi
if [ -z "$EXPECTED" ] || [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "  ✗ Checksum mismatch for $ASSET."
  echo "    expected: ${EXPECTED:-<not listed in SHA256SUMS>}"
  echo "    actual:   $ACTUAL"
  exit 1
fi
echo "  ✓ Checksum OK"

echo "  → Extracting..."
tar -xzf "$WORK/$ASSET" -C "$WORK"

# ─── Install ─────────────────────────────────────────────────────────────────

# An install directory the user named explicitly is created if it is missing.
if [ -n "${RATCHET_INSTALL_DIR:-}" ]; then
  mkdir -p "$INSTALL_DIR" 2>/dev/null || true
fi
if [ ! -d "$INSTALL_DIR" ] || [ ! -w "$INSTALL_DIR" ]; then
  echo "  ! $INSTALL_DIR not writable, falling back to ~/.local/bin"
  INSTALL_DIR="$HOME/.local/bin"
  mkdir -p "$INSTALL_DIR"
fi

if [ ! -f "$WORK/ratchet" ]; then
  echo "  ✗ $ASSET does not contain a ratchet binary; nothing was installed."
  exit 1
fi
for f in "$WORK"/ratchet "$WORK"/ratchet-mcp; do
  if [ -f "$f" ]; then
    chmod +x "$f"
    mv "$f" "$INSTALL_DIR/"
    echo "  ✓ Installed: $INSTALL_DIR/$(basename "$f")"
  fi
done

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *) echo "  ! $INSTALL_DIR is not on your PATH; add it to use \`ratchet\` directly." ;;
esac

# ─── Platform notes ──────────────────────────────────────────────────────────

echo ""
case "$OS" in
  apple-darwin)
    echo "  macOS: no driver is needed. If a programmer is not detected, see"
    echo "    https://github.com/${REPO}/blob/main/docs/macos-usb-permissions.md"
    ;;
  unknown-linux-gnu)
    echo "  Linux: the binaries need the libusb runtime (Debian / Ubuntu: sudo apt install libusb-1.0-0)."
    echo "  To reach the programmer without sudo, install the udev rule:"
    echo "    curl -fsSL https://raw.githubusercontent.com/${REPO}/main/packaging/70-ratchet.rules \\"
    echo "      | sudo tee /etc/udev/rules.d/70-ratchet.rules >/dev/null"
    echo "    sudo udevadm control --reload-rules && sudo udevadm trigger"
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
