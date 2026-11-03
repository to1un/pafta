// SPDX-FileCopyrightText: 2026 to1un
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Prints the compass as a static SVG for the config dialog (docs/compass.js draws it).
// Fixed colors: a mid gray reads on light and dark themes.
//   node tools/compass-svg.js [size] [corners] [hot key] [label]   # defaults: large quarters, nothing hovered
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
function load(file) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/^\.pragma library.*$/m, '');
    const names = [...src.matchAll(/^(?:function|var)\s+(\w+)/gm)].map(m => m[1]);
    return new Function(src + '\nreturn {' + names.join(',') + '};')();
}
const G = load('package/contents/code/geometry.js');
const { PaftaCompass } = load('docs/compass.js');

const [size = 'large', corners = 'quarters', hot = '', label = ''] = process.argv.slice(2);
const c = PaftaCompass(G, { size, corners, fg: '#8a8f94', accent: '#3daee9' });
const w = 2 * c.half, h = w + (label ? 34 : 0);
process.stdout.write(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${-c.half} ${-c.half} ${w} ${h}">`
    + c.markup(hot, label) + '</svg>\n');
