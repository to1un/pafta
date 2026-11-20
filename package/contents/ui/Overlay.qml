// SPDX-FileCopyrightText: 2026 to1un
// SPDX-License-Identifier: GPL-3.0-or-later
import QtQuick
import org.kde.plasma.core as PlasmaCore
import org.kde.kirigami as Kirigami
import "../code/geometry.js" as G

// Input-transparent overlay: shows a whisper-subtle top handle while dragging,
// and the 4-sector Compass + drop preview when pulled into the top edge.
PlasmaCore.Dialog {
    id: overlay

    property var vs: ({ x: 0, y: 0, width: 1, height: 1 })
    property var screenArea: ({ x: 0, y: 0, width: 1, height: 1 })
    property bool dragging: false
    property bool compassOpen: false
    property var center: ({ x: 0, y: 0 })
    property string hot: ""
    property int split: 60
    property var geo: G.compassGeometry("medium")
    property var preview: null

    readonly property color accent: Kirigami.Theme.highlightColor

    title: "pafta overlay"
    location: PlasmaCore.Types.Desktop
    type: PlasmaCore.Dialog.OnScreenDisplay
    backgroundHints: PlasmaCore.Types.NoBackground
    flags: Qt.BypassWindowManagerHint | Qt.FramelessWindowHint | Qt.Popup
    hideOnWindowDeactivate: true
    outputOnly: true
    visible: false
    x: vs.x
    y: vs.y
    width: vs.width
    height: vs.height

    Item {
        width: overlay.vs.width
        height: overlay.vs.height

        Rectangle {
            visible: overlay.dragging && !overlay.compassOpen
            x: overlay.screenArea.x - overlay.vs.x + (overlay.screenArea.width - width) / 2
            y: overlay.screenArea.y - overlay.vs.y + 4
            width: 96
            height: 5
            radius: 3
            color: Qt.rgba(overlay.accent.r, overlay.accent.g, overlay.accent.b, 0.40)
        }

        Rectangle {
            visible: overlay.compassOpen && overlay.preview !== null
            x: overlay.preview ? overlay.preview.x - overlay.vs.x : 0
            y: overlay.preview ? overlay.preview.y - overlay.vs.y : 0
            width: overlay.preview ? overlay.preview.width : 0
            height: overlay.preview ? overlay.preview.height : 0
            radius: 8
            color: Qt.rgba(overlay.accent.r, overlay.accent.g, overlay.accent.b, 0.16)
            border.width: 2
            border.color: overlay.accent
        }

        Compass {
            visible: overlay.compassOpen
            x: overlay.center.x - overlay.vs.x - width / 2
            y: overlay.center.y - overlay.vs.y - height / 2
            hot: overlay.hot
            split: overlay.split
            geo: overlay.geo
        }
    }
}
