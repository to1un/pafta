#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 to1un
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Headless smoke test: static package checks, then a throwaway virtual KWin that loads the
# script. Touches no live session: own XDG dirs, own D-Bus session, own Wayland socket.
#
#   tests/smoke.sh              # LOAD_TIMEOUT=60 SETTLE=3 are tunable via the environment
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG="$ROOT/package"
ID=pafta
LOAD_TIMEOUT="${LOAD_TIMEOUT:-60}"   # seconds to wait for "pafta: loaded"
SETTLE="${SETTLE:-3}"                # seconds to keep running after load, to catch late errors

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "ok: $*"; }

# ---- static checks ---------------------------------------------------------------------

# metadata.json
command -v jq >/dev/null || fail "jq not found"
jq -e --arg id "$ID" '
    .KPlugin.Id == $id
    and (.KPlugin.Version | type == "string" and length > 0)
    and .KPackageStructure == "KWin/Script"
    and .["X-Plasma-API"] == "declarativescript"
    and (.["X-Plasma-MainScript"] | type == "string")' "$PKG/metadata.json" >/dev/null \
    || fail "metadata.json invalid (need KPlugin.Id=$ID, Version, KPackageStructure, X-Plasma-API, X-Plasma-MainScript)"
main_script="$(jq -r '.["X-Plasma-MainScript"]' "$PKG/metadata.json")"
[ -f "$PKG/contents/$main_script" ] || fail "X-Plasma-MainScript contents/$main_script does not exist"
ok "metadata.json (id $ID, version $(jq -r .KPlugin.Version "$PKG/metadata.json"), main contents/$main_script)"

# config.ui compiles with uic, and its kcfg_* widgets match the main.xml entries one to one
UIC=""
for c in /usr/lib/qt6/uic uic6 uic; do
    if p="$(command -v "$c" 2>/dev/null)"; then UIC="$p"; break; fi
done
[ -n "$UIC" ] || fail "uic not found (qt6-tools)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/pafta-smoke.XXXXXX")"
"$UIC" "$PKG/contents/ui/config.ui" -o "$WORK/config_ui.h" 2> "$WORK/uic.err" \
    || { cat "$WORK/uic.err" >&2; fail "uic rejected config.ui"; }
[ -s "$WORK/config_ui.h" ] || fail "uic produced no output"
ok "config.ui compiles ($("$UIC" --version))"

ui_names="$(grep -o 'kcfg_[A-Za-z0-9_]*' "$WORK/config_ui.h" | sed 's/^kcfg_//' | sort -u)"
xml_names="$(grep -o '<entry name="[^"]*"' "$PKG/contents/config/main.xml" | sed 's/.*name="\(.*\)"/\1/' | sort -u)"
[ -n "$ui_names" ] && [ -n "$xml_names" ] || fail "no kcfg_ widgets or no main.xml entries found"
if ! diff <(echo "$ui_names") <(echo "$xml_names") > "$WORK/kcfg.diff"; then
    echo "kcfg mismatch (< config.ui only, > main.xml only):" >&2
    cat "$WORK/kcfg.diff" >&2
    fail "kcfg_* widget names differ from main.xml entries"
fi
ok "kcfg_* widgets == main.xml entries ($(echo "$ui_names" | wc -l) names)"

# ---- headless KWin ---------------------------------------------------------------------

for t in kwin_wayland dbus-run-session; do
    command -v "$t" >/dev/null || fail "$t not found"
done

SB="$WORK/sandbox"
RUNTIME="$WORK/run"
mkdir -p "$SB/config" "$SB/data/kwin/scripts" "$SB/cache" "$SB/state" "$RUNTIME"
chmod 700 "$RUNTIME"
cp -r "$PKG" "$SB/data/kwin/scripts/$ID"
printf '[Plugins]\n%sEnabled=true\n\n[Script-%s]\ndebug=true\n' "$ID" "$ID" > "$SB/config/kwinrc"
LOG="$WORK/kwin.log"
: > "$LOG"

KPID=""
cleanup() {
    local rc=$?
    if [ -n "$KPID" ]; then
        kill -TERM -- "-$KPID" 2>/dev/null || true       # whole process group (dbus-daemon, kwin, helpers)
        for _ in $(seq 30); do kill -0 -- "-$KPID" 2>/dev/null || break; sleep 0.1; done
        kill -KILL -- "-$KPID" 2>/dev/null || true
    fi
    if [ "$rc" -ne 0 ] && [ -s "$LOG" ]; then
        echo "---- last lines of kwin log ($LOG) ----" >&2
        tail -n 40 "$LOG" >&2
        echo "(log kept at $LOG)" >&2
    else
        rm -rf "$WORK"
    fi
    exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# setsid: own process group, so cleanup can take down everything started under it.
env XDG_CONFIG_HOME="$SB/config" XDG_DATA_HOME="$SB/data" XDG_CACHE_HOME="$SB/cache" \
    XDG_STATE_HOME="$SB/state" XDG_RUNTIME_DIR="$RUNTIME" XDG_CURRENT_DESKTOP=KDE \
    QT_FORCE_STDERR_LOGGING=1 QT_QPA_PLATFORM=offscreen \
    setsid dbus-run-session -- kwin_wayland --virtual --output-count 2 --width 1920 --height 1080 \
        --socket pafta-smoke --no-lockscreen --no-global-shortcuts > "$LOG" 2>&1 &
KPID=$!

loaded=""
for _ in $(seq $((LOAD_TIMEOUT * 5))); do
    grep -q 'pafta: loaded' "$LOG" && { loaded=1; break; }
    kill -0 "$KPID" 2>/dev/null || fail "kwin_wayland exited before pafta loaded"
    sleep 0.2
done
[ -n "$loaded" ] || fail "no 'pafta: loaded' within ${LOAD_TIMEOUT}s"
grep -m1 'pafta: loaded' "$LOG"
sleep "$SETTLE"
kill -0 "$KPID" 2>/dev/null || fail "kwin_wayland died after loading pafta"
ok "pafta loaded in a virtual KWin with 2 outputs ($(kwin_wayland --version 2>/dev/null | head -n1))"

# ---- scan the log ------------------------------------------------------------------------

# A line is a pafta problem if it mentions pafta (or the installed package path) together
# with a QML/JS error marker, or is pafta's own "startup failed" warning.
ERR='TypeError|ReferenceError|SyntaxError|RangeError|is not a function|is not defined|is not a constructor|Cannot read|Cannot assign|Unable to assign|is not installed|Type .* unavailable|[Qq]ml.*[Ee]rror|\.qml:[0-9]+(:[0-9]+)?:? .*(error|Error)|\.js:[0-9]+'
bad="$(grep -E -i 'pafta' "$LOG" | grep -E "$ERR|startup failed" || true)"
if [ -n "$bad" ]; then
    echo "$bad" >&2
    fail "QML/JS errors mentioning pafta in the KWin log"
fi
ok "no QML/JS errors mentioning pafta"

# Error lines that do not name pafta: not a failure (other KWin parts), but worth seeing.
other="$(grep -E 'TypeError|ReferenceError|is not a function' "$LOG" | grep -v -i 'pafta' || true)"
[ -z "$other" ] || { echo "note: error lines not mentioning pafta (ignored):" >&2; echo "$other" | head -n 5 >&2; }

echo "PASS: pafta smoke test"
