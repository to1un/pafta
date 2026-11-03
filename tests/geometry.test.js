// SPDX-FileCopyrightText: 2026 to1un
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Unit tests for package/contents/code/geometry.js (a QML `.pragma library`).
// No dependencies: node:test + node:assert. Run: node --test tests/
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PKG = path.join(__dirname, '..', 'package', 'contents');

// Load the library in this realm: drop the pragma and return every top-level function/var.
function load(file) {
    const src = fs.readFileSync(file, 'utf8').replace(/^\.pragma library.*$/m, '');
    const names = [...src.matchAll(/^(?:function|var)\s+(\w+)/gm)].map(m => m[1]);
    return new Function(src + '\nreturn {' + names.join(',') + '};')();
}
const G = load(path.join(PKG, 'code', 'geometry.js'));

const approx = (got, want, eps = 1e-9, msg = '') => assert.ok(Math.abs(got - want) <= eps, `${msg} got ${got}, want ${want}`);
const approxRect = (got, want, eps = 1e-9, msg = '') => {
    for (const k of Object.keys(want))
        approx(got[k], want[k], eps, `${msg} .${k}`);
};

// ---- compass ---------------------------------------------------------------

const center = { x: 500, y: 500 };
const slots = G.DEFAULT_SLOTS;
const rings3 = G.DEFAULT_RINGS; // [33, 50, 67]
// Point at `deg` (0 = east, clockwise on screen) and radius `r` from the center.
const at = (deg, r) => ({ x: center.x + Math.cos(deg * Math.PI / 180) * r, y: center.y + Math.sin(deg * Math.PI / 180) * r });
const DIRS8 = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };

test('compassGeometry: sizes and modes', () => {
    const expectRB = { small: 105, medium: 130, large: 160 };
    for (const [size, rb] of Object.entries(expectRB)) {
        const g = G.compassGeometry(size, 'off');
        assert.equal(g.RB, rb, size);
        assert.equal(g.R3, rb - 20, size);
        assert.equal(g.R0, Math.round(rb * 0.16), size);
        assert.equal(g.cornerRings, false);
        assert.equal(g.sectors.length, 4);
    }
    assert.equal(G.compassGeometry('bogus', 'off').RB, 130, 'unknown size -> medium');
    assert.equal(G.compassGeometry('medium').sectors.length, 4, 'undefined corners = off');
    const q = G.compassGeometry('medium', 'quarters');
    assert.equal(q.sectors.length, 8);
    assert.equal(q.cornerRings, false);
    const r = G.compassGeometry('medium', 'rings');
    assert.equal(r.sectors.length, 8);
    assert.equal(r.cornerRings, true);
});

test('compassHit: corners=rings, 8 directions x every ring, inside the 45 deg sector', () => {
    const C = G.compassGeometry('medium', 'rings');
    const band = (C.R3 - C.R0) / rings3.length;
    for (const [d, deg] of Object.entries(DIRS8)) {
        for (let j = 0; j < rings3.length; ++j) {
            const want = d === 'n' || d === 's' ? d : d + j;
            for (const off of [-20, 0, 20])
                assert.equal(G.compassHit(center, at(deg + off, C.R0 + (j + 0.5) * band), rings3.length, slots, C), want, `${d} ring ${j} off ${off}`);
        }
    }
});

test('compassHit: outermost ring reaches past R3 up to the bezel slack', () => {
    const C = G.compassGeometry('medium', 'rings');
    assert.equal(G.compassHit(center, at(0, C.RB + 39), 3, slots, C), 'e2');
    assert.equal(G.compassHit(center, at(180, C.RB + 39), 3, slots, C), 'w2');
    assert.equal(G.compassHit(center, at(45, C.RB + 39), 3, slots, C), 'se2');
    assert.equal(G.compassHit(center, at(45, C.RB + 41), 3, slots, C), '', 'past bezel + slack');
    assert.equal(G.compassHit(center, at(0, C.RB + 41), 3, slots, C), '');
});

test('compassHit: ring index clamps to the configured ring count', () => {
    const C = G.compassGeometry('medium', 'rings');
    for (const n of [1, 2, 3, 4]) {
        assert.equal(G.compassHit(center, at(0, C.R0 + 1), n, slots, C), 'e0');
        assert.equal(G.compassHit(center, at(0, C.RB + 30), n, slots, C), 'e' + (n - 1));
    }
});

test('compassHit: hub', () => {
    const C = G.compassGeometry('medium', 'rings');
    assert.equal(G.compassHit(center, center, 3, slots, C), 'c');
    assert.equal(G.compassHit(center, at(10, C.R0 - 4), 3, slots, C), 'c');
    assert.equal(G.compassHit(center, at(10, C.R0 - 2), 3, slots, C), '', 'dead band at the hub edge');
    assert.equal(G.compassHit(center, center, 3, { c: 'none', n: 'fill', s: 'centered' }, C), '', 'hub disabled');
});

test('compassHit: none slots disable n/s', () => {
    const C = G.compassGeometry('medium', 'rings');
    const off = { c: 'centered', n: 'none', s: 'none' };
    assert.equal(G.compassHit(center, at(270, 60), 3, off, C), '');
    assert.equal(G.compassHit(center, at(90, 60), 3, off, C), '');
    assert.equal(G.compassHit(center, at(270, 60), 3, slots, C), 'n');
    assert.equal(G.compassHit(center, at(90, 60), 3, slots, C), 's');
});

test('compassHit: sector boundaries (45 deg sectors with corners)', () => {
    const C = G.compassGeometry('medium', 'rings');
    assert.equal(G.compassHit(center, at(22.4, 60), 3, slots, C), 'e1');
    assert.equal(G.compassHit(center, at(22.6, 60), 3, slots, C), 'se1');
    assert.equal(G.compassHit(center, at(67.4, 60), 3, slots, C), 'se1');
    assert.equal(G.compassHit(center, at(67.6, 60), 3, slots, C), 's');
});

test('compassHit: corners=off uses four 90 deg sectors, no diagonals', () => {
    const C = G.compassGeometry('medium', 'off');
    for (const deg of [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]) {
        const hit = G.compassHit(center, at(deg, 60), 3, slots, C);
        const dir = (deg > 315 || deg < 45) ? 'e' : deg < 135 ? 's' : deg < 225 ? 'w' : 'n';
        assert.equal(hit, dir === 'n' || dir === 's' ? dir : dir + '1', `deg ${deg}`);
    }
});

test('compassHit: corners=quarters gives whole diagonals (no ring suffix)', () => {
    const C = G.compassGeometry('medium', 'quarters');
    for (const d of ['ne', 'nw', 'se', 'sw'])
        for (const r of [C.R0 + 1, 50, C.R3 - 1, C.RB + 39])
            assert.equal(G.compassHit(center, at(DIRS8[d], r), 3, slots, C), d, `${d} r=${r}`);
    assert.equal(G.compassHit(center, at(0, C.R0 + 1), 3, slots, C), 'e0');
    assert.equal(G.compassHit(center, at(180, C.RB + 39), 3, slots, C), 'w2');
});

test('compassPlacement: e/w rings are full-height columns', () => {
    const opts = { rings: rings3, slots, cw: 70, ch: 75 };
    const w = [1 / 3, 1 / 2, 2 / 3];
    for (let j = 0; j < 3; ++j) {
        approxRect(G.compassPlacement('w' + j, opts).frac, { x: 0, y: 0, w: w[j], h: 1 });
        approxRect(G.compassPlacement('e' + j, opts).frac, { x: 1 - w[j], y: 0, w: w[j], h: 1 });
        assert.equal(G.compassPlacement('e' + j, opts).max, false);
    }
});

test('compassPlacement: diagonals are half-height corners', () => {
    const opts = { rings: rings3, slots, cw: 70, ch: 75 };
    approxRect(G.compassPlacement('nw', opts).frac, { x: 0, y: 0, w: 0.5, h: 0.5 });
    approxRect(G.compassPlacement('ne', opts).frac, { x: 0.5, y: 0, w: 0.5, h: 0.5 });
    approxRect(G.compassPlacement('sw', opts).frac, { x: 0, y: 0.5, w: 0.5, h: 0.5 });
    approxRect(G.compassPlacement('se', opts).frac, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    approxRect(G.compassPlacement('se0', opts).frac, { x: 2 / 3, y: 0.5, w: 1 / 3, h: 0.5 });
    approxRect(G.compassPlacement('nw2', opts).frac, { x: 0, y: 0, w: 2 / 3, h: 0.5 });
});

test('compassPlacement: every produced fraction is valid', () => {
    for (const rs of [[10], [90], [25, 50, 75, 90]])
        for (const k of ['e', 'w', 'ne', 'nw', 'se', 'sw'])
            for (let j = 0; j < rs.length; ++j)
                assert.ok(G.validFrac(G.compassPlacement(k + j, { rings: rs, slots, cw: 70, ch: 75 }).frac), k + j + ' ' + rs);
});

test('compassPlacement: hub/n/s slot types', () => {
    const o = t => ({ rings: rings3, slots: { c: t, n: t, s: t }, cw: 70, ch: 75 });
    const want = {
        maximize: [true, { x: 0, y: 0, w: 1, h: 1 }],
        fill: [false, { x: 0, y: 0, w: 1, h: 1 }],
        top: [false, { x: 0, y: 0, w: 1, h: 0.5 }],
        bottom: [false, { x: 0, y: 0.5, w: 1, h: 0.5 }],
        centered: [false, { x: 0.15, y: 0.125, w: 0.7, h: 0.75 }]
    };
    for (const k of ['c', 'n', 's'])
        assert.deepEqual(G.compassPlacement(k, o('natural')), { max: false, natural: true, frac: null }, k);
    for (const k of ['c', 'n', 's']) {
        for (const [type, [max, frac]] of Object.entries(want)) {
            const p = G.compassPlacement(k, o(type));
            assert.equal(p.max, max, `${k} ${type}`);
            approxRect(p.frac, frac, 1e-9, `${k} ${type}`);
        }
    }
});

test('slot types and defaults match main.xml', () => {
    const xml = fs.readFileSync(path.join(PKG, 'config', 'main.xml'), 'utf8');
    for (const [entry, slot] of [['compassCenter', 'c'], ['compassNorth', 'n'], ['compassSouth', 's']]) {
        const block = xml.match(new RegExp(`<entry name="${entry}"[\\s\\S]*?</entry>`))[0];
        assert.deepEqual([...block.matchAll(/<choice name="(\w+)"/g)].map(m => m[1]), G.SLOT_TYPES, entry);
        assert.equal(block.match(/<default>(\w+)<\/default>/)[1], G.DEFAULT_SLOTS[slot], entry);
    }
});

// ---- rings parsing ---------------------------------------------------------

test('parseRings: empty input gives defaults without error', () => {
    for (const t of ['', '   ', ',', ' , , ']) {
        const r = G.parseRings(t);
        assert.deepEqual(r.rings, [33, 50, 67], JSON.stringify(t));
        assert.equal(r.error, '');
    }
});

test('parseRings: sort, dedupe, % suffix, rounding', () => {
    assert.deepEqual(G.parseRings('50, 25, 75').rings, [25, 50, 75]);
    assert.deepEqual(G.parseRings('33,33,50,50').rings, [33, 50]);
    assert.deepEqual(G.parseRings('50%').rings, [50]);
    assert.deepEqual(G.parseRings('33.4, 66.6').rings, [33, 67]);
});

test('parseRings: clamps to 10-90', () => {
    assert.deepEqual(G.parseRings('5, 95').rings, [10, 90]);
    assert.deepEqual(G.parseRings('0, 3, 100, 99').rings, [10, 90]);
});

test('parseRings: invalid input falls back to defaults with an error', () => {
    for (const t of ['abc', '50, x', '-5', '1e2', '50;60']) {
        const r = G.parseRings(t);
        assert.deepEqual(r.rings, [33, 50, 67], t);
        assert.match(r.error, /not a number/, t);
    }
    assert.match(G.parseRings('10, 20, 30, 40, 50').error, /at most 4/);
    assert.deepEqual(G.parseRings('10, 20, 30, 40').rings, [10, 20, 30, 40], 'four is allowed');
});

test('ringFrac / ringSymbol', () => {
    approx(G.ringFrac(33), 1 / 3);
    approx(G.ringFrac(40), 0.4);
    assert.equal(G.ringSymbol(33), '⅓');
    assert.equal(G.ringSymbol(40), '40%');
});

// ---- rectangles ------------------------------------------------------------

test('toAbs / toFrac round trip', () => {
    const area = { x: 100, y: 50, width: 1000, height: 800 };
    const f = { x: 0.25, y: 0.5, w: 0.5, h: 0.25 };
    const r = G.toAbs(f, area);
    assert.deepEqual(r, { x: 350, y: 450, width: 500, height: 200 });
    approxRect(G.toFrac(r, area), f);
});

test('defaults: own size at the hub, fill north, centered south', () => {
    assert.deepEqual(G.DEFAULT_SLOTS, { c: 'natural', n: 'fill', s: 'centered' });
});

test('naturalFrac: centered, capped at the whole area', () => {
    const area = { x: 0, y: 0, width: 1000, height: 800 };
    approxRect(G.naturalFrac({ width: 500, height: 400 }, area), { x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    approxRect(G.naturalFrac({ width: 1500, height: 200 }, area), { x: 0, y: 0.375, w: 1, h: 0.25 });
    assert.ok(G.validFrac(G.naturalFrac({ width: 4000, height: 4000 }, area)));
});

test('sameRect tolerance', () => {
    const r = { x: 10, y: 20, width: 300, height: 200 };
    assert.ok(G.sameRect(r, { x: 11, y: 19, width: 300, height: 201 }));
    assert.ok(!G.sameRect(r, { x: 13, y: 20, width: 300, height: 200 }));
});

test('validFrac', () => {
    assert.ok(G.validFrac({ x: 0, y: 0, w: 1, h: 1 }));
    assert.ok(!G.validFrac({ x: 0.5, y: 0, w: 0.6, h: 1 }));
    assert.ok(!G.validFrac({ x: 0, y: 0, w: 0, h: 1 }));
    assert.ok(!G.validFrac(undefined));
});

test('paddedRect: full padding at screen edges, half between tiles', () => {
    const a = { x: 0, y: 0, width: 1000, height: 800 };
    assert.deepEqual(G.paddedRect({ x: 0, y: 0, w: 1, h: 1 }, a, 10), { x: 10, y: 10, width: 980, height: 780 });
    assert.deepEqual(G.paddedRect({ x: 0, y: 0, w: 0.5, h: 1 }, a, 10), { x: 10, y: 10, width: 485, height: 780 });
    assert.deepEqual(G.paddedRect({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, a, 10), { x: 505, y: 405, width: 485, height: 385 });
});

test('pt / arcPath / rad / dist helpers', () => {
    assert.equal(G.pt(0, 10), '10.00 0.00');
    approx(G.rad(180), Math.PI);
    approx(G.dist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
    assert.match(G.arcPath(0, Math.PI / 2, 10, 20), /^M20\.00 0\.00A20 20 0 0 1 0\.00 20\.00L0\.00 10\.00A10 10 0 0 0 10\.00 0\.00Z$/);
});

// ---- docs ------------------------------------------------------------------

test('docs/geometry.js is generated from the current geometry.js', () => {
    const { build } = require(path.join(__dirname, '..', 'tools', 'docs-geometry.js'));
    assert.equal(fs.readFileSync(path.join(__dirname, '..', 'docs', 'geometry.js'), 'utf8'), build(),
        'run: node tools/docs-geometry.js');
});
