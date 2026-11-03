// SPDX-FileCopyrightText: 2026 to1un
// SPDX-License-Identifier: GPL-3.0-or-later
import QtQuick
import QtQuick.Shapes
import org.kde.kirigami as Kirigami
import "../code/geometry.js" as G

// Compass picker ("Rose"): 8-point rose, degree bezel, dashed width rings.
// Purely visual; hit testing is G.compassHit.
Item {
    id: compass

    property string hot: ""          // G.compassHit key
    property var rings: G.DEFAULT_RINGS
    property var slots: G.DEFAULT_SLOTS
    property var geo: G.compassGeometry("medium", "quarters")

    readonly property real half: geo.RB + 4
    readonly property color accent: Kirigami.Theme.highlightColor
    readonly property color fg: Kirigami.Theme.textColor
    readonly property color bg: Kirigami.Theme.backgroundColor
    readonly property string hotSide: hot === "c" ? "" : hot.replace(/\d+$/, "")
    readonly property int hotRing: Number(hot.slice(hotSide.length))
    readonly property var sectors: geo.sectors            // with corners, the diagonals hold quarters
    readonly property real span: 180 / sectors.length    // half a sector, degrees
    readonly property real band: (geo.R3 - geo.R0) / rings.length

    readonly property var letters: ({
        n: i18ndc("pafta", "compass north", "N"), e: i18ndc("pafta", "compass east", "E"),
        s: i18ndc("pafta", "compass south", "S"), w: i18ndc("pafta", "compass west", "W")
    })
    readonly property var names: ({
        centered: i18nd("pafta", "Centered"), maximize: i18nd("pafta", "Maximize"), fill: i18nd("pafta", "Fill"),
        top: i18nd("pafta", "Top half"), bottom: i18nd("pafta", "Bottom half")
    })

    readonly property string label: {
        if (hot === "")
            return "";
        if (hotSide === "w" || hotSide === "e") {
            const f = G.ringSymbol(rings[hotRing]);
            return hotSide === "w" ? i18ndc("pafta", "compass ring, %1 is a width such as ⅓", "%1 left", f)
                : i18ndc("pafta", "compass ring, %1 is a width such as ⅓", "%1 right", f);
        }
        if (hotSide.length === 2) { // a whole quarter is half the width
            const f = G.ringSymbol(hot === hotSide ? 50 : rings[hotRing]);
            return {
                nw: i18ndc("pafta", "compass corner, %1 is a width such as ⅓", "Top-left · %1", f),
                ne: i18ndc("pafta", "compass corner, %1 is a width such as ⅓", "Top-right · %1", f),
                sw: i18ndc("pafta", "compass corner, %1 is a width such as ⅓", "Bottom-left · %1", f),
                se: i18ndc("pafta", "compass corner, %1 is a width such as ⅓", "Bottom-right · %1", f)
            }[hotSide];
        }
        return names[slots[hot]] || "";
    }

    // Outline of the hovered sector, "" for none or the hub.
    readonly property string hotPath: {
        const sector = sectors.find(s => s[0] === hotSide);
        if (!sector)
            return "";
        const a0 = G.rad(sector[1] - span + 1.2), a1 = G.rad(sector[1] + span - 1.2);
        if (hot === hotSide) // n, s and whole diagonals
            return G.arcPath(a0, a1, geo.R0 + 1.5, geo.R3 - 1.5);
        return G.arcPath(a0, a1, geo.R0 + hotRing * band + 1.5, geo.R0 + (hotRing + 1) * band - 1.5);
    }

    function tint(c, a) {
        return Qt.rgba(c.r, c.g, c.b, a);
    }

    // Bezel ticks every 5°, longer at 15° and 45°, clear of the letters; major = 45° only.
    function ticks(major) {
        let s = "";
        for (let d = 0; d < 360; d += 5) {
            const m = d % 90;
            if (m < 12 || m > 78 || (d % 45 === 0) !== major)
                continue;
            s += "M" + G.pt(G.rad(d), geo.R3) + "L" + G.pt(G.rad(d), geo.R3 + (major ? 9 : d % 15 === 0 ? 6 : 3));
        }
        return s;
    }

    // Star points as [shaded half, lit half, shaded fill, lit fill]: the diagonals, then the
    // cardinal ones, north last in the accent color.
    readonly property var arms: star([45, 135, 225, 315], geo.R3 * 0.45, 4, tint(fg, 0.12), tint(fg, 0.04))
        .concat(star([0, 90, 180], geo.R3 - 10, 8, tint(fg, 0.17), tint(fg, 0.06)),
                star([270], geo.R3 - 10, 8, tint(accent, 0.6), tint(accent, 0.28)))

    // One half of a star point (side -1 / 1) from the center to radius `len`.
    function point(deg, len, w, side) {
        const a = G.rad(deg);
        return "M0 0L" + G.pt(a, len) + "L" + G.pt(a + side * Math.PI / 2, w) + "Z";
    }

    // Each half is drawn as its own ShapePath: the GPU CurveRenderer drops triangles of one
    // multi-subpath path that meet at the center and touch along the axes.
    function star(degs, len, w, shaded, lit) {
        return degs.map(d => [point(d, len, w, -1), point(d, len, w, 1), shaded, lit]);
    }

    // Dashed ring borders in the ringed sectors, except around the hovered ring so its outline stays clean.
    function ringArcs() {
        let s = "";
        for (let j = 1; j < rings.length; ++j) {
            const r = geo.R0 + j * band, near = j - hotRing;
            sectors.filter(sec => (sec[0].length === 2 ? geo.cornerRings : sec[0] === "e" || sec[0] === "w") && (hotSide !== sec[0] || (near !== 0 && near !== 1))).forEach(sec => {
                s += "M" + G.pt(G.rad(sec[1] - span + 2), r) + "A" + r + " " + r + " 0 0 1 " + G.pt(G.rad(sec[1] + span - 2), r);
            });
        }
        return s;
    }

    width: 2 * half
    height: 2 * half

    Rectangle {
        anchors.centerIn: parent
        width: 2 * geo.RB
        height: width
        radius: geo.RB
        color: compass.tint(compass.bg, 0.95)
        border.color: compass.tint(compass.fg, 0.15)
    }

    Shape {
        x: compass.half
        y: compass.half
        preferredRendererType: Shape.CurveRenderer
        ShapePath { // face
            strokeColor: compass.tint(compass.fg, 0.2)
            fillColor: compass.tint(compass.fg, 0.03)
            PathAngleArc { radiusX: compass.geo.R3; radiusY: compass.geo.R3; sweepAngle: 360 }
        }
        ShapePath {
            strokeColor: compass.tint(compass.fg, 0.22)
            fillColor: "transparent"
            PathSvg { path: compass.ticks(false) }
        }
        ShapePath {
            strokeColor: compass.tint(compass.fg, 0.45)
            fillColor: "transparent"
            PathSvg { path: compass.ticks(true) }
        }
        ShapePath { // sector borders
            strokeColor: compass.tint(compass.fg, 0.07)
            fillColor: "transparent"
            PathSvg { path: compass.sectors.map(s => s[1] + compass.span).map(d => "M" + G.pt(G.rad(d), compass.geo.R0) + "L" + G.pt(G.rad(d), compass.geo.R3)).join("") }
        }
        ShapePath {
            strokeColor: compass.tint(compass.fg, 0.26)
            fillColor: "transparent"
            strokeStyle: ShapePath.DashLine
            dashPattern: [2, 3]
            PathSvg { path: compass.ringArcs() }
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
        ShapePath { // hovered sector
            strokeColor: compass.hotPath ? compass.accent : "transparent"
            strokeWidth: 2
            fillColor: compass.tint(compass.accent, 0.18)
            PathSvg { path: compass.hotPath }
        }
    }

    Repeater {
        model: [["n", 270], ["e", 0], ["s", 90], ["w", 180]]
        Text {
            required property var modelData
            readonly property real lr: (geo.R3 + geo.RB) / 2
            readonly property bool north: modelData[0] === "n"
            visible: compass.slots[modelData[0]] !== "none"
            x: compass.half + Math.cos(G.rad(modelData[1])) * lr - width / 2
            y: compass.half + Math.sin(G.rad(modelData[1])) * lr - height / 2
            text: compass.letters[modelData[0]]
            font.pixelSize: north ? 13 : 12
            font.weight: north ? Font.Bold : Font.DemiBold
            color: compass.hotSide === modelData[0] ? compass.fg : north ? compass.accent : compass.tint(compass.fg, 0.55)
        }
    }

    Rectangle {
        readonly property bool on: compass.hot === "c"
        anchors.centerIn: parent
        width: 2 * (geo.R0 - 3)
        height: width
        radius: width / 2
        visible: compass.slots.c !== "none"
        color: on ? Qt.tint(compass.bg, compass.tint(compass.accent, 0.18)) : compass.bg
        border.width: on ? 2 : 1
        border.color: on ? compass.accent : compass.tint(compass.fg, 0.3)
    }

    Rectangle {
        visible: compass.label !== ""
        x: compass.half - width / 2
        y: 2 * compass.half + 4
        width: labelText.implicitWidth + 16
        height: labelText.implicitHeight + 6
        radius: height / 2
        color: compass.tint(compass.bg, 0.94)
        border.color: compass.tint(compass.fg, 0.15)
        Text {
            id: labelText
            anchors.centerIn: parent
            text: compass.label
            color: compass.fg
            font.pixelSize: 12
        }
    }
}
