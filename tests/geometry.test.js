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

const center = { x: 500, y: 500 };
const at = (deg, r) => ({ x: center.x + Math.cos(deg * Math.PI / 180) * r, y: center.y + Math.sin(deg * Math.PI / 180) * r });

test('compassGeometry: sizes and 4 sectors', () => {
    const expectRB = { small: 90, medium: 110, large: 130 };
    for (const [size, rb] of Object.entries(expectRB)) {
        const g = G.compassGeometry(size);
        assert.equal(g.RB, rb, size);
        assert.equal(g.R3, rb - 18, size);
        assert.equal(g.R0, Math.round(rb * 0.25), size);
        assert.equal(g.sectors.length, 4);
    }
    assert.equal(G.compassGeometry('bogus').RB, 110, 'unknown size -> medium');
});

test('compassHit: 4 cardinal sectors, hub, and outer slack', () => {
    const C = G.compassGeometry('medium');
    assert.equal(G.compassHit(center, center, C), 'c');
    assert.equal(G.compassHit(center, at(45, C.R0 - 2), C), 'c');
    for (const [key, deg] of [['e', 0], ['s', 90], ['w', 180], ['n', 270]]) {
        for (const off of [-40, 0, 40]) {
            assert.equal(G.compassHit(center, at(deg + off, C.R0 + 10), C), key, `${key} off ${off}`);
            assert.equal(G.compassHit(center, at(deg + off, C.RB + 39), C), key, `${key} slack off ${off}`);
        }
        assert.equal(G.compassHit(center, at(deg, C.RB + 41), C), '', `${key} past slack`);
    }
});

test('slotFromCompassKey maps sectors cleanly', () => {
    assert.equal(G.slotFromCompassKey('w'), 'left');
    assert.equal(G.slotFromCompassKey('e'), 'right');
    assert.equal(G.slotFromCompassKey('n'), 'fill');
    assert.equal(G.slotFromCompassKey('s'), 'center');
    assert.equal(G.slotFromCompassKey('c'), '');
    assert.equal(G.slotFromCompassKey(''), '');
});

test('inTopTrigger covers full screen width including right side', () => {
    const area = { x: 100, y: 20, width: 1920, height: 1030 };
    assert.ok(G.inTopTrigger({ x: 100, y: 20 }, area), 'top-left corner');
    assert.ok(G.inTopTrigger({ x: 1060, y: 35 }, area), 'top-center');
    assert.ok(G.inTopTrigger({ x: 1850, y: 56 }, area), 'top-right (Obsidian drag)');
    assert.ok(!G.inTopTrigger({ x: 1850, y: 57 }, area), 'below trigger band');
    assert.ok(!G.inTopTrigger({ x: 99, y: 25 }, area), 'left of output area');
    assert.ok(!G.inTopTrigger({ x: 2021, y: 25 }, area), 'right of output area');
});

test('compassCenterAtTop tracks cursor X and clamps to screen bounds', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1030 };
    const geo = G.compassGeometry('medium'); // RB = 110
    assert.deepEqual(G.compassCenterAtTop(1600, area, geo), { x: 1600, y: 124 });
    assert.deepEqual(G.compassCenterAtTop(20, area, geo), { x: 126, y: 124 });
    assert.deepEqual(G.compassCenterAtTop(1910, area, geo), { x: 1794, y: 124 });
});

test('compassDismissed when pulled down or well sideways', () => {
    const geo = G.compassGeometry('medium'); // RB = 110
    const c = { x: 1600, y: 124 };
    assert.ok(!G.compassDismissed(c, { x: 1600, y: 270 }, geo));
    assert.ok(G.compassDismissed(c, { x: 1600, y: 271 }, geo));
    assert.ok(!G.compassDismissed(c, { x: 1770, y: 124 }, geo));
    assert.ok(G.compassDismissed(c, { x: 1771, y: 124 }, geo));
});

test('normalizeLayout clamps values and preserves explicit 0 gaps', () => {
    assert.deepEqual(G.normalizeLayout(null), G.DEFAULT_LAYOUT);
    assert.deepEqual(
        G.normalizeLayout({ split: 10, outerX: 0, outerY: 0, innerGap: 0, centerW: 120, centerH: 5 }),
        { split: 25, outerX: 0, outerY: 0, innerGap: 0, centerW: 95, centerH: 20 }
    );
});

test('slotRect computes asymmetric outerX, outerY, innerGap, split, and center', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1030 };
    const layout = { split: 60, outerX: 16, outerY: 10, innerGap: 8, centerW: 50, centerH: 70 };
    // availW = 1920 - 32 = 1888; availH = 1030 - 20 = 1010
    // leftW = round((1888 - 8) * 0.6) = round(1128) = 1128
    // rightX = 16 + 1128 + 8 = 1152; rightW = (16 + 1888) - 1152 = 752
    assert.deepEqual(G.slotRect('fill', area, layout), { x: 16, y: 10, width: 1888, height: 1010 });
    assert.deepEqual(G.slotRect('left', area, layout), { x: 16, y: 10, width: 1128, height: 1010 });
    assert.deepEqual(G.slotRect('right', area, layout), { x: 1152, y: 10, width: 752, height: 1010 });
    assert.deepEqual(G.slotRect('w', area, layout), G.slotRect('left', area, layout));
    assert.deepEqual(G.slotRect('e', area, layout), G.slotRect('right', area, layout));
    assert.deepEqual(G.slotRect('n', area, layout), G.slotRect('fill', area, layout));

    // center: cw = 944, ch = 707 -> x = 16 + (1888-944)/2 = 488, y = 10 + round((1010-707)/2) = 162
    assert.deepEqual(G.slotRect('center', area, layout), { x: 488, y: 162, width: 944, height: 707 });
    assert.deepEqual(G.slotRect('s', area, layout), G.slotRect('center', area, layout));
    assert.equal(G.slotRect('bogus', area, layout), null);
});

test('toAbs / toFrac round trip and clamping inside area', () => {
    const area = { x: 100, y: 50, width: 1000, height: 800 };
    const f = { x: 0.25, y: 0.5, w: 0.5, h: 0.25 };
    const r = G.toAbs(f, area);
    assert.deepEqual(r, { x: 350, y: 450, width: 500, height: 200 });
    approxRect(G.toFrac(r, area), f);

    const clamped = G.toAbs({ x: -0.04, y: 0.9, w: 0.5, h: 0.2 }, area);
    assert.equal(clamped.x, 100);
    assert.equal(clamped.y + clamped.height, 850);
});

test('validFrac and sameRect', () => {
    assert.ok(G.validFrac({ x: 0, y: 0, w: 1, h: 1 }));
    assert.ok(G.validFrac({ x: -0.01, y: 0, w: 0.5, h: 0.5 }));
    assert.ok(!G.validFrac({ x: 0.5, y: 0, w: 0.6, h: 1 }));
    assert.ok(!G.validFrac({ x: 0, y: 0, w: 0, h: 1 }));
    assert.ok(!G.validFrac(undefined));

    const r = { x: 10, y: 20, width: 300, height: 200 };
    assert.ok(G.sameRect(r, { x: 12, y: 18, width: 300, height: 202 }));
    assert.ok(!G.sameRect(r, { x: 13, y: 20, width: 300, height: 200 }));
});

test('pt / arcPath / rad / dist helpers', () => {
    assert.equal(G.pt(0, 10), '10.00 0.00');
    approx(G.rad(180), Math.PI);
    approx(G.dist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
    assert.match(G.arcPath(0, Math.PI / 2, 10, 20), /^M20\.00 0\.00A20 20 0 0 1 0\.00 20\.00L0\.00 10\.00A10 10 0 0 0 10\.00 0\.00Z$/);
});

test('main.xml compassSize choices match COMPASS_SIZES', () => {
    const xml = fs.readFileSync(path.join(PKG, 'config', 'main.xml'), 'utf8');
    const block = xml.match(/<entry name="compassSize"[\s\S]*?<\/entry>/)[0];
    assert.deepEqual([...block.matchAll(/<choice name="(\w+)"/g)].map(m => m[1]), Object.keys(G.COMPASS_SIZES));
});

test('docs/geometry.js is generated from the current geometry.js', () => {
    const { build } = require(path.join(__dirname, '..', 'tools', 'docs-geometry.js'));
    assert.equal(fs.readFileSync(path.join(__dirname, '..', 'docs', 'geometry.js'), 'utf8'), build(),
        'run: node tools/docs-geometry.js');
});

test('main.xml and config.ui are well-formed XML', () => {
    function assertWellFormedXml(file) {
        const raw = fs.readFileSync(file, 'utf8')
            .replace(/<\?[\s\S]*?\?>/g, '')
            .replace(/<!--[\s\S]*?-->/g, '');
        const stack = [];
        for (const m of raw.matchAll(/<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>/g)) {
            const [, close, tag, , selfClose] = m;
            if (close && selfClose)
                throw new Error(`${file}: invalid tag </${tag}/>`);
            if (close) {
                const top = stack.pop();
                assert.equal(top, tag, `${file}: mismatched </${tag}> (expected </${top || 'EOF'}>)`);
            } else if (!selfClose) {
                stack.push(tag);
            }
        }
        assert.deepEqual(stack, [], `${file}: unclosed tags ${stack.join(', ')}`);
        assert.equal(raw.replace(/<[^>]+>/g, '').search(/[<>]/), -1, `${file}: stray angle bracket in text`);
    }
    assertWellFormedXml(path.join(PKG, 'config', 'main.xml'));
    assertWellFormedXml(path.join(PKG, 'ui', 'config.ui'));
});
