// SPDX-FileCopyrightText: 2026 to1un
// SPDX-License-Identifier: GPL-3.0-or-later
import QtQuick
import QtQuick.Shapes
import org.kde.kirigami as Kirigami
import "../code/geometry.js" as G

// 4-sector Pafta compass picker ("Rose"). Purely visual; hit testing is G.compassHit.
Item {
    id: compass

    property string hot: ""
    property int split: 60
    property var geo: G.compassGeometry("medium")

    readonly property real half: geo.RB + 4
    readonly property color accent: Kirigami.Theme.highlightColor
    readonly property color fg: Kirigami.Theme.textColor
    readonly property color bg: Kirigami.Theme.backgroundColor
    readonly property var sectors: geo.sectors
    readonly property real span: 45

    readonly property var letters: ({
        n: i18ndc("pafta", "compass north", "N"),
        e: i18ndc("pafta", "compass east", "E"),
        s: i18ndc("pafta", "compass south", "S"),
        w: i18ndc("pafta", "compass west", "W")
    })

    readonly property var sectorLabels: ({
        n: i18nd("pafta", "Fill"),
        e: (100 - split) + "%",
        s: i18nd("pafta", "Center"),
        w: split + "%"
    })

    readonly property string label: {
        switch (hot) {
        case "w": return i18nd("pafta", "Left %1%", split);
        case "e": return i18nd("pafta", "Right %1%", 100 - split);
        case "n": return i18nd("pafta", "Fill");
        case "s": return i18nd("pafta", "Center");
        case "c": return i18nd("pafta", "Free");
        }
        return "";
    }

    readonly property string hotPath: {
        const sector = sectors.find(s => s[0] === hot);
        if (!sector)
            return "";
        const a0 = G.rad(sector[1] - span + 1.5), a1 = G.rad(sector[1] + span - 1.5);
        return G.arcPath(a0, a1, geo.R0 + 2, geo.R3 - 2);
    }

    function tint(c, a) {
        return Qt.rgba(c.r, c.g, c.b, a);
    }

    function ticks(major) {
        let s = "";
        for (let d = 0; d < 360; d += 5) {
            const m = d % 90;
            if (m < 14 || m > 76 || (d % 45 === 0) !== major)
                continue;
            s += "M" + G.pt(G.rad(d), geo.R3) + "L" + G.pt(G.rad(d), geo.R3 + (major ? 7 : d % 15 === 0 ? 5 : 2.5));
        }
        return s;
    }

    function point(deg, len, w, side) {
        const a = G.rad(deg);
        return "M0 0L" + G.pt(a, len) + "L" + G.pt(a + side * Math.PI / 2, w) + "Z";
    }

    // Separate ShapePath per half: GPU CurveRenderer drops adjacent triangles inside one subpath.
    function star(degs, len, w, shaded, lit) {
        return degs.map(d => [point(d, len, w, -1), point(d, len, w, 1), shaded, lit]);
    }

    readonly property var arms: star([0, 90, 180], geo.R3 - 10, 6.5, tint(fg, 0.22), tint(fg, 0.08))
        .concat(star([270], geo.R3 - 10, 6.5, tint(accent, 0.58), tint(accent, 0.26)))

    width: 2 * half
    height: 2 * half

    Rectangle {
        anchors.centerIn: parent
        width: 2 * geo.RB
        height: width
        radius: geo.RB
        color: compass.tint(compass.bg, 0.96)
        border.color: compass.tint(compass.fg, 0.22)
    }

    Shape {
        x: compass.half
        y: compass.half
        preferredRendererType: Shape.CurveRenderer
        ShapePath {
            strokeColor: compass.tint(compass.fg, 0.22)
            fillColor: compass.tint(compass.fg, 0.04)
            PathAngleArc { radiusX: compass.geo.R3; radiusY: compass.geo.R3; sweepAngle: 360 }
        }
        ShapePath {
            strokeColor: compass.tint(compass.fg, 0.25)
            fillColor: "transparent"
            PathSvg { path: compass.ticks(false) }
        }
        ShapePath {
            strokeColor: compass.tint(compass.fg, 0.5)
            fillColor: "transparent"
            PathSvg { path: compass.ticks(true) }
        }
        ShapePath {
            strokeColor: compass.tint(compass.fg, 0.16)
            fillColor: "transparent"
            PathSvg { path: [45, 135, 225, 315].map(d => "M" + G.pt(G.rad(d), compass.geo.R0) + "L" + G.pt(G.rad(d), compass.geo.R3)).join("") }
        }
    }

    Item {
        x: compass.half
        y: compass.half
        Repeater {
            model: compass.arms
            Shape {
                id: arm
                required property var modelData
                preferredRendererType: Shape.CurveRenderer
                ShapePath {
                    strokeColor: "transparent"
                    fillColor: arm.modelData[2]
                    PathSvg { path: arm.modelData[0] }
                }
                ShapePath {
                    strokeColor: "transparent"
                    fillColor: arm.modelData[3]
                    PathSvg { path: arm.modelData[1] }
                }
            }
        }
    }

    Shape {
        x: compass.half
        y: compass.half
        preferredRendererType: Shape.CurveRenderer
        ShapePath {
            strokeColor: compass.hotPath ? compass.accent : "transparent"
            strokeWidth: 2
            fillColor: compass.tint(compass.accent, 0.20)
            PathSvg { path: compass.hotPath }
        }
    }

    Repeater {
        model: [["n", 270], ["e", 0], ["s", 90], ["w", 180]]
        Text {
            required property var modelData
            readonly property real lr: (geo.R3 + geo.RB) / 2
            readonly property bool north: modelData[0] === "n"
            x: compass.half + Math.cos(G.rad(modelData[1])) * lr - width / 2
            y: compass.half + Math.sin(G.rad(modelData[1])) * lr - height / 2
            text: compass.letters[modelData[0]]
            font.pixelSize: north ? 12 : 11
            font.weight: Font.Bold
            color: compass.hot === modelData[0] ? compass.fg : north ? compass.accent : compass.tint(compass.fg, 0.65)
        }
    }

    Repeater {
        model: [["n", 270], ["e", 0], ["s", 90], ["w", 180]]
        Text {
            required property var modelData
            readonly property real rMid: (geo.R0 + geo.R3) * 0.56
            readonly property bool active: compass.hot === modelData[0]
            x: compass.half + Math.cos(G.rad(modelData[1])) * rMid - width / 2
            y: compass.half + Math.sin(G.rad(modelData[1])) * rMid - height / 2
            text: compass.sectorLabels[modelData[0]]
            font.pixelSize: 11
            font.weight: Font.DemiBold
            color: active ? compass.accent : compass.tint(compass.fg, 0.82)
        }
    }

    Rectangle {
        readonly property bool on: compass.hot === "c"
        anchors.centerIn: parent
        width: 2 * (geo.R0 - 2)
        height: width
        radius: width / 2
        color: on ? Qt.tint(compass.bg, compass.tint(compass.accent, 0.20)) : compass.bg
        border.width: on ? 2 : 1
        border.color: on ? compass.accent : compass.tint(compass.fg, 0.35)
        Text {
            anchors.centerIn: parent
            text: i18nd("pafta", "Free")
            font.pixelSize: 10
            font.weight: Font.DemiBold
            color: parent.on ? compass.accent : compass.tint(compass.fg, 0.72)
        }
    }

    Rectangle {
        visible: compass.label !== ""
        x: compass.half - width / 2
        y: 2 * compass.half + 4
        width: labelText.implicitWidth + 18
        height: labelText.implicitHeight + 6
        radius: height / 2
        color: compass.tint(compass.bg, 0.95)
        border.color: compass.accent
        border.width: 1
        Text {
            id: labelText
            anchors.centerIn: parent
            text: compass.label
            color: compass.fg
            font.pixelSize: 12
            font.weight: Font.DemiBold
        }
    }
}
