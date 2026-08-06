#!/bin/sh
set -eu

# NOTE: no grep anywhere in this script.
#
# grep colours its match when the environment forces --color=always (a common
# GREP_OPTIONS / alias setup), and those ANSI escapes end up inside whatever is
# extracted -- a release tag, a filename. The result is a download URL with
# escape codes in it, or a checksum for a file that does not exist. sed -n and
# awk do not colour, so they are used for every extraction here.

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

  # --- Which product of the family to install ---
  #
  # One script, because there is now one release: every product -- the eser CLI,
  # the noskills and laroux CLIs carved out of it, and the noskills-server
  # daemon -- is built at the same version by the same pipeline into the same
  # SHA256SUMS.txt. There used to be a second installer for the daemon because
  # GoReleaser published it separately under a different naming scheme; that
  # split is what left each release carrying only half the family.
  #
  #   curl ... | sh                     -> eser
  #   curl ... | sh -s noskills         -> noskills
  #   curl ... | sh -s noskills-server  -> the daemon
  BINARY="${1:-eser}"

  case "${BINARY}" in
    eser|noskills|laroux|noskills-server) ;;
    *) error "Unknown product: ${BINARY} (expected eser, noskills, laroux or noskills-server)" ;;
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
    | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
  [ -z "${TAG}" ] && error "Failed to determine latest version"

  ARCHIVE="${BINARY}-${TAG}-${TARGET}.tar.gz"
  BASE_URL="https://github.com/eser/stack/releases/download/${TAG}"

  # --- Download archive and checksums ---
  printf "Downloading %s %s for %s...\n" "${BINARY}" "${TAG}" "${TARGET}"
  curl -fsSL -o "${TMPDIR}/${ARCHIVE}" "${BASE_URL}/${ARCHIVE}" \
    || error "Failed to download ${BINARY}"
  curl -fsSL -o "${TMPDIR}/SHA256SUMS.txt" "${BASE_URL}/SHA256SUMS.txt" \
    || error "Failed to download checksums"

  # --- Verify checksum ---
  # awk's exact field match, not grep: grep colours its match when the
  # environment forces --color=always, and the archive name contains dots that
  # grep would treat as wildcards. Neither is hypothetical -- the colour escapes
  # broke the sibling installer.
  EXPECTED="$(awk -v want="${ARCHIVE}" '$2 == want { print $1 }' "${TMPDIR}/SHA256SUMS.txt")"
  ACTUAL="$(cd "${TMPDIR}" && ${CHECKSUM_CMD} "${ARCHIVE}" | awk '{print $1}')"
  # An empty EXPECTED means the archive was not listed at all. Without this the
  # comparison could only fail, never explain -- and a missing entry is a
  # different problem from a mismatch.
  [ -n "${EXPECTED}" ] || error "no checksum listed for ${ARCHIVE}"
  [ "${EXPECTED}" = "${ACTUAL}" ] || error "SHA256 checksum verification failed"

  # --- Extract and install ---
  tar -xzf "${TMPDIR}/${ARCHIVE}" -C "${TMPDIR}"

  if [ -w "${INSTALL_DIR}" ]; then
    mv "${TMPDIR}/${BINARY}" "${INSTALL_DIR}/${BINARY}"
    chmod +x "${INSTALL_DIR}/${BINARY}"
  else
    printf "Installing to %s requires elevated permissions.\n" "${INSTALL_DIR}"
    sudo mv "${TMPDIR}/${BINARY}" "${INSTALL_DIR}/${BINARY}"
    sudo chmod +x "${INSTALL_DIR}/${BINARY}"
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
  printf "%s %s installed to %s/%s\n" "${BINARY}" "${TAG}" "${INSTALL_DIR}" "${BINARY}"
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
