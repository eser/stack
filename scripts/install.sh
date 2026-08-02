#!/usr/bin/env sh
# noskills-server install script
# Usage: curl -fsSL https://raw.githubusercontent.com/eser/stack/main/scripts/install.sh | sh
set -e

REPO="eser/stack"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

# ── Detect platform ──────────────────────────────────────────────────────────

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)  OS_NAME="Linux"  ;;
  Darwin) OS_NAME="Darwin" ;;
  *)      echo "Unsupported OS: $OS" >&2; exit 1 ;;
esac

case "$ARCH" in
  x86_64)  ARCH_NAME="x86_64" ;;
  aarch64|arm64) ARCH_NAME="arm64" ;;
  *)        echo "Unsupported arch: $ARCH" >&2; exit 1 ;;
esac

# ── Resolve latest version ───────────────────────────────────────────────────

if [ -z "$VERSION" ]; then
  VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' | sed 's/.*"tag_name": *"v\([^"]*\)".*/\1/')"
fi

if [ -z "$VERSION" ]; then
  echo "Could not determine latest version" >&2
  exit 1
fi

echo "Installing noskills-server v${VERSION} (${OS_NAME}/${ARCH_NAME})..."

# ── Download and extract ─────────────────────────────────────────────────────

TARBALL="noskills_${VERSION}_${OS_NAME}_${ARCH_NAME}.tar.gz"
URL="https://github.com/${REPO}/releases/download/v${VERSION}/${TARBALL}"
CHECKSUM_URL="https://github.com/${REPO}/releases/download/v${VERSION}/checksums.txt"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

curl -fsSL "$URL" -o "${TMP}/${TARBALL}"

# Verify checksum if shasum is available
if command -v shasum >/dev/null 2>&1; then
  curl -fsSL "$CHECKSUM_URL" -o "${TMP}/checksums.txt"
  cd "$TMP"
  grep "$TARBALL" checksums.txt | shasum -a 256 -c - >/dev/null 2>&1 || {
    echo "Checksum verification failed" >&2
    exit 1
  }
  cd - >/dev/null
fi

tar -xzf "${TMP}/${TARBALL}" -C "$TMP" noskills-server noskills 2>/dev/null || \
  tar -xzf "${TMP}/${TARBALL}" -C "$TMP"

# ── Install ──────────────────────────────────────────────────────────────────

if [ ! -w "$INSTALL_DIR" ]; then
  echo "Installing to ${INSTALL_DIR} (sudo required)..."
  sudo mv "${TMP}/noskills-server" "${INSTALL_DIR}/noskills-server"
  sudo mv "${TMP}/noskills" "${INSTALL_DIR}/noskills" 2>/dev/null || true
  sudo chmod +x "${INSTALL_DIR}/noskills-server"
  sudo chmod +x "${INSTALL_DIR}/noskills" 2>/dev/null || true
else
  mv "${TMP}/noskills-server" "${INSTALL_DIR}/noskills-server"
  mv "${TMP}/noskills" "${INSTALL_DIR}/noskills" 2>/dev/null || true
  chmod +x "${INSTALL_DIR}/noskills-server"
  chmod +x "${INSTALL_DIR}/noskills" 2>/dev/null || true
fi

echo ""
echo "noskills-server v${VERSION} installed to ${INSTALL_DIR}/noskills-server"
echo ""
echo "Start the daemon:"
echo "  noskills-server start"
echo ""
echo "Check everything is working:"
echo "  noskills-server doctor"
