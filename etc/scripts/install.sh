#!/bin/sh
set -eu

main() {
  # --- Platform detection ---
  OS="$(uname -s)"
  ARCH="$(uname -m)"

  case "${OS}" in
    Linux)
      case "${ARCH}" in
        x86_64)  TARGET="x86_64-unknown-linux-gnu" ;;
        aarch64) TARGET="aarch64-unknown-linux-gnu" ;;
        *)       error "Unsupported platform: ${OS} ${ARCH}" ;;
      esac
      CHECKSUM_CMD="sha256sum"
      ;;
    Darwin)
      case "${ARCH}" in
        x86_64) TARGET="x86_64-apple-darwin" ;;
        arm64)  TARGET="aarch64-apple-darwin" ;;
        *)      error "Unsupported platform: ${OS} ${ARCH}" ;;
      esac
      CHECKSUM_CMD="shasum -a 256"
      ;;
    *) error "Unsupported platform: ${OS} ${ARCH}" ;;
  esac

  # --- Install directory ---
  if [ -n "${ESER_INSTALL_DIR:-}" ]; then
    INSTALL_DIR="${ESER_INSTALL_DIR}"
  elif [ -w "${HOME}/.local/bin" ] && echo "${PATH}" | grep -q "${HOME}/.local/bin"; then
    INSTALL_DIR="${HOME}/.local/bin"
  else
    INSTALL_DIR="/usr/local/bin"
  fi

  # --- Temp directory with cleanup ---
  TMPDIR="$(mktemp -d)"
  trap 'rm -rf "${TMPDIR}"' EXIT

  # --- Fetch latest version ---
  TAG="$(curl -fsSL https://api.github.com/repos/eser/stack/releases/latest \
    | grep '"tag_name"' | sed 's/.*"tag_name": *"//;s/".*//')"
  [ -z "${TAG}" ] && error "Failed to determine latest version"

  ARCHIVE="eser-${TAG}-${TARGET}.tar.gz"
  BASE_URL="https://github.com/eser/stack/releases/download/${TAG}"

  # --- Download archive and checksums ---
  printf "Downloading eser %s for %s...\n" "${TAG}" "${TARGET}"
  curl -fsSL -o "${TMPDIR}/${ARCHIVE}" "${BASE_URL}/${ARCHIVE}" \
    || error "Failed to download eser"
  curl -fsSL -o "${TMPDIR}/SHA256SUMS.txt" "${BASE_URL}/SHA256SUMS.txt" \
    || error "Failed to download checksums"

  # --- Verify checksum ---
  EXPECTED="$(grep "${ARCHIVE}" "${TMPDIR}/SHA256SUMS.txt" | awk '{print $1}')"
  ACTUAL="$(cd "${TMPDIR}" && ${CHECKSUM_CMD} "${ARCHIVE}" | awk '{print $1}')"
  [ "${EXPECTED}" = "${ACTUAL}" ] || error "SHA256 checksum verification failed"

  # --- Extract and install ---
  tar -xzf "${TMPDIR}/${ARCHIVE}" -C "${TMPDIR}"

  if [ -w "${INSTALL_DIR}" ]; then
    mv "${TMPDIR}/eser" "${INSTALL_DIR}/eser"
    chmod +x "${INSTALL_DIR}/eser"
  else
    printf "Installing to %s requires elevated permissions.\n" "${INSTALL_DIR}"
    sudo mv "${TMPDIR}/eser" "${INSTALL_DIR}/eser"
    sudo chmod +x "${INSTALL_DIR}/eser"
  fi

  # --- PATH check ---
  case ":${PATH}:" in
    *":${INSTALL_DIR}:"*) ;;
    *)
      printf "\nWarning: %s is not in your PATH.\n" "${INSTALL_DIR}"
      printf "Add it to your shell profile:\n"
      printf "  export PATH=\"%s:\$PATH\"\n" "${INSTALL_DIR}"
      ;;
  esac

  # --- Success ---
  printf "\n"
  printf "eser %s installed to %s/eser\n" "${TAG}" "${INSTALL_DIR}"
  printf "\n"

  # --- Shell-aware completions hint ---
  SHELL_NAME="$(basename "${SHELL:-/bin/sh}")"
  printf "To enable completions:\n"
  case "${SHELL_NAME}" in
    bash) printf "  eser system completions --shell bash >> ~/.bashrc\n" ;;
    zsh)  printf "  eser system completions --shell zsh >> ~/.zshrc\n" ;;
    fish) printf "  eser system completions --shell fish >> ~/.config/fish/config.fish\n" ;;
    *)    printf "  eser system completions --shell %s\n" "${SHELL_NAME}" ;;
  esac
  printf "\n"
}

error() {
  printf "Error: %s\n" "$1" >&2
  exit 1
}

main "$@"
