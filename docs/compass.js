// SPDX-FileCopyrightText: 2026 to1un
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The compass as SVG markup, drawn like package/contents/ui/Compass.qml from geometry.js (G).
// Shared by the landing page demo and tools/compass-svg.js (the config dialog's picture).
// opts: { size, corners, fg, accent, base } — fg may be "currentColor"; base: an opaque disc under
// the face (styled by CSS class "base"), for drawing over windows.
var PaftaCompass = function (G, opts) {
    var geo = G.compassGeometry(opts.size, opts.corners), rings = G.DEFAULT_RINGS;
    var fg = opts.fg, accent = opts.accent;
    var span = 180 / geo.sectors.length, band = (geo.R3 - geo.R0) / rings.length;

    function path(d, attrs) {
        return '<path d="' + d + '" ' + attrs + '/>';
    }

    function stroke(a) {
        return 'stroke="' + fg + '" stroke-opacity="' + a + '"';
    }

    // Bezel ticks every 5°, longer at 15° and 45°, clear of the letters; major = 45° only.
    function ticks(major) {
        var s = '';
        for (var d = 0; d < 360; d += 5) {
            var m = d % 90;
            if (m < 12 || m > 78 || (d % 45 === 0) !== major)
                continue;
            s += 'M' + G.pt(G.rad(d), geo.R3) + 'L' + G.pt(G.rad(d), geo.R3 + (major ? 9 : d % 15 === 0 ? 6 : 3));
        }
        return s;
    }

    function point(deg, len, w, side) {
        var a = G.rad(deg);
        return 'M0 0L' + G.pt(a, len) + 'L' + G.pt(a + side * Math.PI / 2, w) + 'Z';
    }

    function arms(degs, len, w, color, shaded, lit) {
        return degs.map(function (d) {
            return path(point(d, len, w, -1), 'fill="' + color + '" fill-opacity="' + shaded + '"')
                + path(point(d, len, w, 1), 'fill="' + color + '" fill-opacity="' + lit + '"');
        }).join('');
    }

    function ringArcs() {
        var s = '';
        for (var j = 1; j < rings.length; ++j) {
            var r = geo.R0 + j * band;
            geo.sectors.forEach(function (sec) {
                if (sec[0].length === 2 ? geo.cornerRings : sec[0] === 'e' || sec[0] === 'w')
                    s += 'M' + G.pt(G.rad(sec[1] - span + 2), r) + 'A' + r + ' ' + r + ' 0 0 1 ' + G.pt(G.rad(sec[1] + span - 2), r);
            });
        }
        return s;
    }

    function text(x, y, t, attrs) {
        return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" ' + attrs + '>' + t + '</text>';
    }

    var borders = geo.sectors.map(function (s) {
        var d = s[1] + span;
        return 'M' + G.pt(G.rad(d), geo.R0) + 'L' + G.pt(G.rad(d), geo.R3);
    }).join('');
    var lr = (geo.R3 + geo.RB) / 2;
    var letters = [['N', 270], ['E', 0], ['S', 90], ['W', 180]].map(function (l) {
        var north = l[0] === 'N';
        return text(Math.cos(G.rad(l[1])) * lr, Math.sin(G.rad(l[1])) * lr + 4.5, l[0],
            'fill="' + (north ? accent : fg) + '" fill-opacity="' + (north ? 1 : 0.75) + '" font-size="' + (north ? 13 : 12) + '" font-weight="bold"');
    }).join('');
    // Ring widths, faint, just above the east/west axis.
    var widths = rings.map(function (p, j) {
        var r = geo.R0 + (j + 0.5) * band;
        return [0, 180].map(function (deg) {
            return text(Math.cos(G.rad(deg)) * r, -8, G.ringSymbol(p), 'fill="' + fg + '" fill-opacity="0.75" font-size="10"');
        }).join('');
    }).join('');

    var face = (opts.base ? '<circle r="' + geo.RB + '" class="base"/>' : '')
        + '<circle r="' + geo.RB + '" fill="' + fg + '" fill-opacity="0.06" ' + stroke(0.35) + '/>'
        + '<circle r="' + geo.R3 + '" fill="' + fg + '" fill-opacity="0.05" ' + stroke(0.4) + '/>'
        + path(ticks(false), 'fill="none" ' + stroke(0.4))
        + path(ticks(true), 'fill="none" ' + stroke(0.7))
        + path(borders, 'fill="none" ' + stroke(0.2))
        + path(ringArcs(), 'fill="none" ' + stroke(0.5) + ' stroke-dasharray="2 3"')
        + arms([45, 135, 225, 315], geo.R3 * 0.45, 4, fg, 0.3, 0.12)
        + arms([0, 90, 180], geo.R3 - 10, 8, fg, 0.38, 0.16)
        + arms([270], geo.R3 - 10, 8, accent, 0.6, 0.28);
    var hub = '<circle r="' + (geo.R0 - 3) + '" fill="' + fg + '" fill-opacity="0.15" ' + stroke(0.6) + '/>';

    // Outline of a hovered sector (a G.compassHit key), as Compass.qml hotPath; "" for none or the hub.
    function hotPath(hot) {
        var side = hot === 'c' ? '' : hot.replace(/\d+$/, '');
        var sector = geo.sectors.filter(function (s) { return s[0] === side; })[0];
        if (!sector)
            return '';
        var a0 = G.rad(sector[1] - span + 1.2), a1 = G.rad(sector[1] + span - 1.2), ring = Number(hot.slice(side.length));
        return hot === side ? G.arcPath(a0, a1, geo.R0 + 1.5, geo.R3 - 1.5)
            : G.arcPath(a0, a1, geo.R0 + ring * band + 1.5, geo.R0 + (ring + 1) * band - 1.5);
    }

    function hot(key) {
        if (key === 'c')
            return '<circle r="' + (geo.R0 - 3) + '" fill="' + accent + '" fill-opacity="0.25" stroke="' + accent + '" stroke-width="2"/>';
        var d = key ? hotPath(key) : '';
        return d ? path(d, 'fill="' + accent + '" fill-opacity="0.18" stroke="' + accent + '" stroke-width="2"') : '';
    }

    // The label pill under the compass, centered on x = 0, its top at y.
    function pill(label, y) {
        if (!label)
            return '';
        var w = label.length * 7 + 18;
        return '<rect x="' + (-w / 2) + '" y="' + y + '" width="' + w + '" height="22" rx="11" fill="' + fg + '" fill-opacity="0.12" ' + stroke(0.35) + '/>'
            + '<text y="' + (y + 15) + '" fill="' + fg + '" font-size="12" text-anchor="middle">' + label + '</text>';
    }

    // Full markup centered on (0, 0): face, the hovered sector over the star, letters, hub.
    function markup(key, label) {
        var hubHot = key === 'c';
        return '<g text-anchor="middle" font-family="sans-serif">' + face + (hubHot ? '' : hot(key)) + letters + widths
            + (hubHot ? hot(key) : hub) + pill(label, geo.RB + 8) + '</g>';
    }

    return { geo: geo, half: geo.RB + 4, markup: markup };
};
