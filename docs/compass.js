// SPDX-FileCopyrightText: 2026 to1un
// SPDX-License-Identifier: GPL-3.0-or-later
//
// 4-sector Pafta compass as SVG markup, matching package/contents/ui/Compass.qml from geometry.js (G).
// opts: { size, split, fg, accent, base }
var PaftaCompass = function (G, opts) {
    var geo = G.compassGeometry(opts.size);
    var split = opts.split || 60;
    var fg = opts.fg, accent = opts.accent;

    function path(d, attrs) {
        return '<path d="' + d + '" ' + attrs + '/>';
    }

    function stroke(a) {
        return 'stroke="' + fg + '" stroke-opacity="' + a + '"';
    }

    function ticks(major) {
        var s = '';
        for (var d = 0; d < 360; d += 5) {
            var m = d % 90;
            if (m < 14 || m > 76 || (d % 45 === 0) !== major)
                continue;
            s += 'M' + G.pt(G.rad(d), geo.R3) + 'L' + G.pt(G.rad(d), geo.R3 + (major ? 7 : d % 15 === 0 ? 5 : 2.5));
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

    function text(x, y, t, attrs) {
        return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" ' + attrs + '>' + t + '</text>';
    }

    var dividers = [45, 135, 225, 315].map(function (d) {
        return 'M' + G.pt(G.rad(d), geo.R0) + 'L' + G.pt(G.rad(d), geo.R3);
    }).join('');
    var lr = (geo.R3 + geo.RB) / 2;
    var letters = [['N', 270], ['E', 0], ['S', 90], ['W', 180]].map(function (l) {
        var north = l[0] === 'N';
        return text(Math.cos(G.rad(l[1])) * lr, Math.sin(G.rad(l[1])) * lr + 4, l[0],
            'fill="' + (north ? accent : fg) + '" fill-opacity="' + (north ? 1 : 0.72) + '" font-size="' + (north ? 12 : 11) + '" font-weight="bold"');
    }).join('');

    var rMid = (geo.R0 + geo.R3) * 0.56;
    var sectorTexts = [
        ['n', 270, 'Fill'],
        ['e', 0, (100 - split) + '%'],
        ['s', 90, 'Center'],
        ['w', 180, split + '%']
    ];

    var face = (opts.base ? '<circle r="' + geo.RB + '" class="base"/>' : '')
        + '<circle r="' + geo.RB + '" fill="' + fg + '" fill-opacity="0.06" ' + stroke(0.32) + '/>'
        + '<circle r="' + geo.R3 + '" fill="' + fg + '" fill-opacity="0.04" ' + stroke(0.35) + '/>'
        + path(ticks(false), 'fill="none" ' + stroke(0.35))
        + path(ticks(true), 'fill="none" ' + stroke(0.65))
        + path(dividers, 'fill="none" ' + stroke(0.22))
        + arms([0, 90, 180], geo.R3 - 10, 6.5, fg, 0.34, 0.14)
        + arms([270], geo.R3 - 10, 6.5, accent, 0.58, 0.26);

    function hotPath(hot) {
        var sector = geo.sectors.filter(function (s) { return s[0] === hot; })[0];
        if (!sector)
            return '';
        return G.arcPath(G.rad(sector[1] - 43.5), G.rad(sector[1] + 43.5), geo.R0 + 2, geo.R3 - 2);
    }

    function hot(key) {
        if (key === 'c')
            return '<circle r="' + (geo.R0 - 2) + '" fill="' + accent + '" fill-opacity="0.25" stroke="' + accent + '" stroke-width="2"/>';
        var d = key ? hotPath(key) : '';
        return d ? path(d, 'fill="' + accent + '" fill-opacity="0.20" stroke="' + accent + '" stroke-width="2"') : '';
    }

    function pill(label, y) {
        if (!label)
            return '';
        var w = Math.max(64, label.length * 7.2 + 20);
        return '<rect x="' + (-w / 2) + '" y="' + y + '" width="' + w + '" height="22" rx="11" fill="' + fg + '" fill-opacity="0.12" stroke="' + accent + '"/>'
            + '<text y="' + (y + 15) + '" fill="' + fg + '" font-size="12" font-weight="600" text-anchor="middle">' + label + '</text>';
    }

    function markup(key, label) {
        var hubHot = key === 'c';
        var hub = '<circle r="' + (geo.R0 - 2) + '" fill="' + fg + '" fill-opacity="0.10" ' + stroke(0.5) + '/>'
            + '<text y="3.5" fill="' + fg + '" fill-opacity="0.72" font-size="9.5" font-weight="600" text-anchor="middle">Free</text>';
        var labels = sectorTexts.map(function (st) {
            var active = key === st[0];
            return text(Math.cos(G.rad(st[1])) * rMid, Math.sin(G.rad(st[1])) * rMid + 4, st[2],
                'fill="' + (active ? accent : fg) + '" fill-opacity="' + (active ? 1 : 0.8) + '" font-size="11" font-weight="600"');
        }).join('');
        return '<g text-anchor="middle" font-family="sans-serif">' + face + (hubHot ? '' : hot(key))
            + letters + labels + (hubHot ? hot(key) : hub) + pill(label, geo.RB + 8) + '</g>';
    }

    return { geo: geo, half: geo.RB + 4, markup: markup };
};
