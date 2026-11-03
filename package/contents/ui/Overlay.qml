// SPDX-FileCopyrightText: 2026 to1un
// SPDX-License-Identifier: GPL-3.0-or-later
import QtQuick
import org.kde.plasma.core as PlasmaCore
import org.kde.kirigami as Kirigami
import "../code/geometry.js" as G

// Input-transparent overlay shown while the compass is open; all state comes from main.qml.
PlasmaCore.Dialog {
    id: overlay

    property var vs: ({ x: 0, y: 0, width: 1, height: 1 })   // virtual screen
    property var center: ({ x: 0, y: 0 })
    property string hot: ""                                  // G.compassHit key
    property var compass: ({ rings: G.DEFAULT_RINGS, slots: G.DEFAULT_SLOTS, geo: G.compassGeometry("medium", "quarters") })
    property var preview: null                               // absolute rect

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
            visible: overlay.preview !== null
            x: overlay.preview ? overlay.preview.x - overlay.vs.x : 0
            y: overlay.preview ? overlay.preview.y - overlay.vs.y : 0
            width: overlay.preview ? overlay.preview.width : 0
            height: overlay.preview ? overlay.preview.height : 0
            radius: 8
            color: Qt.rgba(overlay.accent.r, overlay.accent.g, overlay.accent.b, 0.15)
            border.width: 2
            border.color: overlay.accent
        }

        Compass {
            x: overlay.center.x - overlay.vs.x - width / 2
            y: overlay.center.y - overlay.vs.y - height / 2
            hot: overlay.hot
            rings: overlay.compass.rings
            slots: overlay.compass.slots
            geo: overlay.compass.geo
        }
    }
}
