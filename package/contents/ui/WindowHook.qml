// SPDX-FileCopyrightText: 2026 to1un
// SPDX-License-Identifier: GPL-3.0-or-later
import QtQuick

// Per-window signal forwarding. A Connections object (parented to the script root) is
// torn down with the script, unlike signal.connect() closures which outlive an unload.
Connections {
    property var window
    property var handler
    property var restore: null          // { frame, output } from before the window was maximized
    property QtObject restoreTile: null // its tile then; a guarded pointer, null once KWin deletes the tile
    property var natural: null          // own size { width, height }, see main.qml naturalSize()
    property bool resizing: false

    target: window

    function onInteractiveMoveResizeStarted() {
        handler.moveResizeStarted(window);
    }
    function onInteractiveMoveResizeFinished() {
        handler.moveResizeFinished(window);
    }
    function onMaximizedAboutToChange(mode) {
        handler.maximizeAboutToChange(window, mode);
    }
    function onMaximizedChanged() {
        handler.maximizeChanged(window);
    }
    function onTileChanged(tile) {
        handler.tileChanged(window, tile);
    }
    function onClosed() {
        handler.windowClosed(window);
    }
}
