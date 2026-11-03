// SPDX-FileCopyrightText: 2026 to1un
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Prints the compass as a static SVG, drawn like package/contents/ui/Compass.qml from the same
// geometry.js, for the config dialog. Fixed colors: a mid gray reads on light and dark themes.
//   node tools/compass-svg.js [size] [corners]     # defaults: large quarters
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'package', 'contents', 'code', 'geometry.js'), 'utf8')
    .replace(/^\.pragma library.*$/m, '');
const names = [...src.matchAll(/^(?:function|var)\s+(\w+)/gm)].map(m => m[1]);
const G = new Function(src + '\nreturn {' + names.join(',') + '};')();

const geo = G.compassGeometry(process.argv[2] || 'large', process.argv[3] || 'quarters');
const rings = G.DEFAULT_RINGS;
const FG = '#8a8f94', ACCENT = '#3daee9';
const half = geo.RB + 4, span = 180 / geo.sectors.length, band = (geo.R3 - geo.R0) / rings.length;

const path_ = (d, attrs) => `<path d="${d}" ${attrs}/>`;
const fg = a => `${FG}" stroke-opacity="${a}`;

function ticks(major) {
    let s = '';
    for (let d = 0; d < 360; d += 5) {
        const m = d % 90;
        if (m < 12 || m > 78 || (d % 45 === 0) !== major)
            continue;
        s += 'M' + G.pt(G.rad(d), geo.R3) + 'L' + G.pt(G.rad(d), geo.R3 + (major ? 9 : d % 15 === 0 ? 6 : 3));
    }
    return s;
}

function point(deg, len, w, side) {
    const a = G.rad(deg);
    return 'M0 0L' + G.pt(a, len) + 'L' + G.pt(a + side * Math.PI / 2, w) + 'Z';
}

function arms(degs, len, w, color, shaded, lit) {
    return degs.map(d => path_(point(d, len, w, -1), `fill="${color}" fill-opacity="${shaded}"`)
        + path_(point(d, len, w, 1), `fill="${color}" fill-opacity="${lit}"`)).join('');
}

function ringArcs() {
    let s = '';
    for (let j = 1; j < rings.length; ++j) {
        const r = geo.R0 + j * band;
        geo.sectors.filter(sec => sec[0].length === 2 ? geo.cornerRings : sec[0] === 'e' || sec[0] === 'w').forEach(sec => {
            s += 'M' + G.pt(G.rad(sec[1] - span + 2), r) + 'A' + r + ' ' + r + ' 0 0 1 ' + G.pt(G.rad(sec[1] + span - 2), r);
        });
    }
    return s;
}

const borders = geo.sectors.map(s => s[1] + span)
    .map(d => 'M' + G.pt(G.rad(d), geo.R0) + 'L' + G.pt(G.rad(d), geo.R3)).join('');
const lr = (geo.R3 + geo.RB) / 2;
const letters = [['N', 270], ['E', 0], ['S', 90], ['W', 180]].map(([t, deg]) => {
    const north = t === 'N';
    return `<text x="${(Math.cos(G.rad(deg)) * lr).toFixed(1)}" y="${(Math.sin(G.rad(deg)) * lr + 4.5).toFixed(1)}" `
        + `fill="${north ? ACCENT : FG}" font-size="${north ? 13 : 12}" font-weight="bold">${t}</text>`;
}).join('');
// Ring widths, faint, in the middle of each east/west band.
const widths = rings.map((p, j) => {
    const r = geo.R0 + (j + 0.5) * band;
    return [0, 180].map(deg => `<text x="${(Math.cos(G.rad(deg)) * r).toFixed(1)}" y="${(Math.sin(G.rad(deg)) * r - 8).toFixed(1)}" `
        + `fill="${FG}" font-size="10">${G.ringSymbol(p)}</text>`).join('');
}).join('');

const size = 2 * half;
process.stdout.write(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-half} ${-half} ${size} ${size}" `
    + `font-family="sans-serif" text-anchor="middle">`
    + `<circle r="${geo.RB}" fill="${FG}" fill-opacity="0.06" stroke="${fg(0.35)}"/>`
    + `<circle r="${geo.R3}" fill="${FG}" fill-opacity="0.05" stroke="${fg(0.4)}"/>`
    + path_(ticks(false), `fill="none" stroke="${fg(0.4)}"`)
    + path_(ticks(true), `fill="none" stroke="${fg(0.7)}"`)
    + path_(borders, `fill="none" stroke="${fg(0.2)}"`)
    + path_(ringArcs(), `fill="none" stroke="${fg(0.5)}" stroke-dasharray="2 3"`)
    + arms([45, 135, 225, 315], geo.R3 * 0.45, 4, FG, 0.3, 0.12)
    + arms([0, 90, 180], geo.R3 - 10, 8, FG, 0.38, 0.16)
    + arms([270], geo.R3 - 10, 8, ACCENT, 0.6, 0.28)
    + `<circle r="${geo.R0 - 3}" fill="${FG}" fill-opacity="0.15" stroke="${fg(0.6)}"/>`
    + letters + widths
    + '</svg>\n');
