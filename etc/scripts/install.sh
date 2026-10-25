#!/bin/sh
set -eu

# NOTE: no grep anywhere in this script.
#
# grep colours its match when the environment forces --color=always (a common
# GREP_OPTIONS / alias setup), and those ANSI escapes end up inside whatever is
# extracted -- a release tag, a filename. The result is a download URL with
# escape codes in it, or a checksum for a file that does not exist. sed -n and
# awk do not colour, so they are used for every extraction here.

# The first release whose laroux comes from npm only (decision-29). For this
# tag and later ones the script prints the npm command instead of installing
# the laroux archive, which those releases keep only for the self-update of
# installed v4.5.x binaries.
LAROUX_NPM_ONLY_VERSION="5.0.0"

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
  #
  # ESER_INSTALL_VERSION picks a release (4.5.2 or v4.5.2) instead of the
  # latest one.
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

  # --- Resolve the release ---
  if [ -n "${ESER_INSTALL_VERSION:-}" ]; then
    TAG="v${ESER_INSTALL_VERSION#v}"
    NPM_SPEC="${BINARY}@${TAG#v}"
  else
    TAG="$(curl -fsSL https://api.github.com/repos/eser/stack/releases/latest \
      | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
    [ -z "${TAG}" ] && error "Failed to determine latest version"
    NPM_SPEC="${BINARY}"
  fi

  # --- laroux is on npm only from LAROUX_NPM_ONLY_VERSION ---
  if [ "${BINARY}" = "laroux" ] && version_at_least "${TAG#v}" "${LAROUX_NPM_ONLY_VERSION}"; then
    use_npm "laroux is installed from npm from v${LAROUX_NPM_ONLY_VERSION} on."
  fi

  ARCHIVE="${BINARY}-${TAG}-${TARGET}.tar.gz"
  BASE_URL="https://github.com/eser/stack/releases/download/${TAG}"

  # --- Download archive and checksums ---
  #
  # The script is served from main and reads whatever release it resolves, so
  # it decides from that release's archives (decision-11): a release without
  # this binary's archive answers 404, and the npm package is the way to
  # install it instead. No -f here, so the status code tells a missing archive
  # from a failed download.
  printf "Downloading %s %s for %s...\n" "${BINARY}" "${TAG}" "${TARGET}"
  STATUS="$(curl -sSL -w '%{http_code}' -o "${TMPDIR}/${ARCHIVE}" "${BASE_URL}/${ARCHIVE}")" \
    || error "Failed to download ${BINARY}"
  if [ "${STATUS}" = "404" ]; then
    case "${BINARY}" in
      noskills-server) error "${TAG} has no ${ARCHIVE}" ;;
      *) use_npm "${TAG} has no ${BINARY} archive for ${TARGET}." ;;
    esac
  fi
  [ "${STATUS}" = "200" ] || error "Failed to download ${BINARY} (HTTP ${STATUS})"
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
  # Defer to the binary itself.
  #
  # This used to hardcode `eser` regardless of which product was installed, and
  # to tell users to append the completion SCRIPT into their rc file with `>>`.
  # Both were wrong: completions are written to a file and sourced (see
  # getCompletionSourceLine in @eserstack/shell/env), and `sh -s noskills-server`
  # would have printed instructions for a different binary. The command below
  # prints the correct, per-shell instructions for the product just installed.
  printf "To enable completions:\n"
  printf "  %s system completions\n" "${BINARY}"
  printf "\n"
}

error() {
  printf "Error: %s\n" "$1" >&2
  exit 1
}

# use_npm prints why the archive is not installed and the npm command that
# installs the package, then exits non-zero: nothing was installed.
use_npm() {
  printf "%s\n" "$1" >&2
  printf "Install it from npm instead:\n" >&2
  printf "  npm i -g %s\n" "${NPM_SPEC}" >&2
  exit 1
}

# version_at_least succeeds when version $1 is at or above $2. Both are
# major.minor.patch without the "v"; a pre-release suffix is ignored.
version_at_least() {
  awk -v have="$1" -v want="$2" 'BEGIN {
    split(have, h, /[.-]/)
    split(want, w, /[.-]/)
    for (i = 1; i <= 3; i++) {
      if (h[i] + 0 > w[i] + 0) exit 0
      if (h[i] + 0 < w[i] + 0) exit 1
    }
    exit 0
  }'
}

main "$@"
