// SPDX-FileCopyrightText: 2026 to1un
// SPDX-License-Identifier: GPL-3.0-or-later
.pragma library
.import "geometry.js" as G

// Read-only helpers for KWin's native custom tiles (RootTile/CustomTile, kwin src/tiles/customtile.h).
// The tile layout belongs to the user (Meta+T, per desktop); pafta only puts windows into it.

function fracOf(tile) {
    var g = tile.relativeGeometry;
    return { x: g.x, y: g.y, w: g.width, h: g.height };
}

function leaves(root) {
    var out = [];
    (function walk(t) {
        var kids = t.tiles;
        if (kids.length === 0) {
            if (t !== root)
                out.push(t);
            return;
        }
        for (var i = 0; i < kids.length; ++i)
            walk(kids[i]);
    })(root);
    return out;
}

// The leaf tile covering `frac`, or null.
function tileMatching(root, frac) {
    var all = leaves(root);
    for (var i = 0; i < all.length; ++i) {
        if (G.sameFrac(fracOf(all[i]), frac, 0.02))
            return all[i];
    }
    return null;
}
