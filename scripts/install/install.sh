#!/usr/bin/env bash
# Installs or updates no-fomo-social on macOS. Your library in ~/.no-fomo-social is never touched.
#
#   curl -fsSL https://raw.githubusercontent.com/no-fomo-org/no-fomo-social/main/scripts/install/install.sh | bash
#
# NO_FOMO_SOCIAL_DOWNLOAD_BASE points at another folder of release files (for testing).

# Everything is inside main(), so a half-downloaded script never runs.
main() {
  set -euo pipefail

  local base="${NO_FOMO_SOCIAL_DOWNLOAD_BASE:-https://github.com/no-fomo-org/no-fomo-social/releases/latest/download}"
  local home_dir="${NO_FOMO_SOCIAL_HOME:-$HOME/.no-fomo-social}"
  local app_dir="$home_dir/app"
  local store_url="https://chromewebstore.google.com/detail/mjakjbjejpmchdgghkgjkjgmkdainedj"

  say() { printf '\033[1m%s\033[0m\n' "$*"; }
  fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

  if [ "$(uname -s)" != "Darwin" ]; then
    fail "This installer is for Mac. On Windows, open PowerShell and run: irm https://raw.githubusercontent.com/no-fomo-org/no-fomo-social/main/scripts/install/install.ps1 | iex"
  fi
  local major
  major="$(sw_vers -productVersion | cut -d. -f1)"
  if [ "$major" -lt 11 ]; then fail "no-fomo-social needs macOS 11 (Big Sur) or newer."; fi

  # An Apple chip can run this script under Rosetta; still install the native app.
  local arch="x64"
  if [ "$(uname -m)" = "arm64" ] || [ "$(sysctl -in sysctl.proc_translated 2>/dev/null)" = "1" ]; then arch="arm64"; fi
  local file="no-fomo-social-darwin-$arch.tar.gz"

  say "Installing no-fomo-social for Mac ($arch)…"
  local tmp
  tmp="$(mktemp -d)"
  # shellcheck disable=SC2064 # expand now: $tmp is gone when the trap runs
  trap "rm -rf '$tmp'" EXIT

  echo "Downloading (about 100 MB)…"
  # HTTPS only, even after a redirect.
  local -a curl_opts=(--proto '=https' --tlsv1.2)
  if [ "${base#http://127.0.0.1}" != "$base" ] || [ "${base#http://localhost}" != "$base" ]; then curl_opts=(); fi
  # ${arr[@]+"${arr[@]}"}: an empty array is an error under set -u in the bash 3.2 that macOS ships.
  curl ${curl_opts[@]+"${curl_opts[@]}"} -fL --progress-bar "$base/$file" -o "$tmp/$file" || fail "Download failed. Check your internet connection and try again."
  curl ${curl_opts[@]+"${curl_opts[@]}"} -fsSL "$base/SHA256SUMS" -o "$tmp/SHA256SUMS" || fail "Could not download the checksum file."

  local expected actual
  expected="$(awk -v f="$file" '$2 == f { print $1 }' "$tmp/SHA256SUMS")"
  actual="$(shasum -a 256 "$tmp/$file" | awk '{ print $1 }')"
  if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
    fail "The download is damaged or changed (checksum does not match). Nothing was installed."
  fi

  mkdir -p "$home_dir"
  tar -xzf "$tmp/$file" -C "$tmp"

  # Stop the old version before its files are replaced.
  if [ -x "$app_dir/bin/no-fomo-social" ]; then "$app_dir/bin/no-fomo-social" stop || true; fi
  rm -rf "$app_dir.old"
  if [ -d "$app_dir" ]; then mv "$app_dir" "$app_dir.old"; fi
  mv "$tmp/app" "$app_dir"
  rm -rf "$app_dir.old"

  # A small app in ~/Applications, so no-fomo-social opens from Launchpad, Spotlight and the Dock.
  local bundle="$HOME/Applications/no-fomo-social.app"
  rm -rf "$bundle"
  mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources"
  cp "$app_dir/icons/no-fomo-social.icns" "$bundle/Contents/Resources/no-fomo-social.icns"
  cat >"$bundle/Contents/MacOS/no-fomo-social" <<EOF
#!/bin/sh
exec "$app_dir/bin/no-fomo-social" start
EOF
  chmod +x "$bundle/Contents/MacOS/no-fomo-social"
  cat >"$bundle/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>no-fomo-social</string>
  <key>CFBundleDisplayName</key><string>no-fomo-social</string>
  <key>CFBundleIdentifier</key><string>app.no-fomo.social.launcher</string>
  <key>CFBundleVersion</key><string>$(cat "$app_dir/VERSION")</string>
  <key>CFBundleShortVersionString</key><string>$(cat "$app_dir/VERSION")</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>no-fomo-social</string>
  <key>CFBundleIconFile</key><string>no-fomo-social</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
EOF
  touch "$bundle"

  # The `no-fomo-social` command, for people who like the terminal.
  mkdir -p "$HOME/.local/bin"
  ln -sf "$app_dir/bin/no-fomo-social" "$HOME/.local/bin/no-fomo-social"

  local chrome=0
  if [ -d "/Applications/Google Chrome.app" ] || [ -d "$HOME/Applications/Google Chrome.app" ]; then chrome=1; fi

  say "Starting no-fomo-social…"
  "$app_dir/bin/no-fomo-social" start || fail "no-fomo-social was installed but did not start. Run: $app_dir/bin/no-fomo-social logs"

  echo
  say "Done! no-fomo-social $(cat "$app_dir/VERSION") is installed."
  echo
  if [ "$chrome" = 0 ]; then
    echo "  • no-fomo-social works with Google Chrome. Get it at https://www.google.com/chrome/"
  fi
  echo "  • Add the extension to Chrome: $store_url"
  echo "  • Log in to instagram.com in Chrome, then press Sync in no-fomo-social."
  echo
  echo "  Open no-fomo-social any time from Launchpad or Spotlight (Cmd + Space, type no-fomo-social)."
  echo "  Your library stays in $home_dir."
}

main "$@"
