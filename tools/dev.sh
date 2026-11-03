#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 to1un
# SPDX-License-Identifier: GPL-3.0-or-later
#
# pafta dev loop: install | enable | disable | reload | reconfigure | status | logs | sandbox | uninstall
set -euo pipefail

ID=pafta
PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/package"
DEV_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/pafta-dev"
QDBUS="$(command -v qdbus6 || command -v qdbus)"

scripting() { "$QDBUS" org.kde.KWin /Scripting "org.kde.kwin.Scripting.$1" "${@:2}"; }
reconfigure() { "$QDBUS" org.kde.KWin /KWin reconfigure; }
loaded() { scripting isScriptLoaded "$ID"; }

install() {
    kpackagetool6 --type=KWin/Script --install "$PKG" >/dev/null 2>&1 \
        || kpackagetool6 --type=KWin/Script --upgrade "$PKG"
    echo "installed $PKG"
}

set_enabled() {
    kwriteconfig6 --file kwinrc --group Plugins --key "${ID}Enabled" "$1"
    reconfigure
}

# KWin shares one QQmlEngine for all scripts, which caches compiled QML by URL, so
# re-loading the installed path can run stale code. Load a fresh copy under a new URL
# instead (the plugin name, and with it the [Script-pafta] config group, stays "pafta").
reload() {
    install
    if [ "$(loaded)" = "true" ]; then
        scripting unloadScript "$ID" >/dev/null
        for _ in $(seq 50); do [ "$(loaded)" = "false" ] && break; sleep 0.1; done
    fi
    mkdir -p "$DEV_DIR"
    local copy
    copy="$DEV_DIR/$(date +%s%N)"
    cp -r "$PKG" "$copy"
    scripting loadDeclarativeScript "$copy/contents/ui/main.qml" "$ID" >/dev/null
    scripting start
    find "$DEV_DIR" -mindepth 1 -maxdepth 1 -type d ! -path "$copy" ! -name sandbox -mmin +1 -exec rm -rf {} +
    echo "reloaded from $copy (loaded: $(loaded))"
}

# Nested KWin in a window with throw-away config/data dirs; the live session is untouched.
sandbox() {
    local sb="$DEV_DIR/sandbox"
    rm -rf "$sb"
    mkdir -p "$sb/config" "$sb/data/kwin/scripts" "$sb/cache" "$sb/state"
    cp -r "$PKG" "$sb/data/kwin/scripts/$ID"
    printf '[Plugins]\n%sEnabled=true\n\n[Script-%s]\ndebug=true\n' "$ID" "$ID" > "$sb/config/kwinrc"
    env XDG_CONFIG_HOME="$sb/config" XDG_DATA_HOME="$sb/data" XDG_CACHE_HOME="$sb/cache" XDG_STATE_HOME="$sb/state" \
        QT_FORCE_STDERR_LOGGING=1 \
        dbus-run-session -- kwin_wayland --wayland-display "$WAYLAND_DISPLAY" --socket pafta-sandbox \
        --no-lockscreen --width "${SANDBOX_WIDTH:-1600}" --height "${SANDBOX_HEIGHT:-900}" "${@:-konsole}"
}

case "${1:-}" in
    sandbox) shift; sandbox "$@" ;;
    install) install ;;
    enable) set_enabled true ;;
    disable) set_enabled false ;;
    reload) reload ;;
    reconfigure) reconfigure ;;
    status) echo "loaded: $(loaded)" ;;
    logs) journalctl --user -u plasma-kwin_wayland -f -o cat | grep --line-buffered -i "pafta" ;;
    uninstall)
        set_enabled false
        kpackagetool6 --type=KWin/Script --remove "$ID"
        ;;
    *)
        echo "usage: $0 install|enable|disable|reload|reconfigure|status|logs|sandbox [apps...]|uninstall" >&2
        exit 2
        ;;
esac
