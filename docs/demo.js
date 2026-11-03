// SPDX-FileCopyrightText: 2026 to1un
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Scripted demo for the landing page: a small desktop where windows are dragged onto the
// compass. Deterministic: render(t) draws the moment t (seconds) of the loop, so the capture
// script can step through frames. Needs G (geometry.js) and PaftaCompass (compass.js).
var PaftaDemo = (function () {
    var W = 800, H = 450, AREA = { x: 0, y: 0, width: 800, height: 416 }, PAD = 6, SCALE = 0.75;
    var NS = 'http://www.w3.org/2000/svg';
    var compass = PaftaCompass(G, { size: 'medium', corners: 'quarters', fg: 'currentColor', accent: '#3daee9', base: true });
    var opts = { rings: G.DEFAULT_RINGS, slots: { c: 'natural', n: 'fill', s: 'centered' }, cw: 70, ch: 75 };

    var OWN = { files: { x: 150, y: 70, width: 340, height: 230 }, notes: { x: 440, y: 150, width: 300, height: 200 } };
    // Each act: grab a window at `grab` (from its top-left), drop on compass key `key`.
    var ACTS = [
        { win: 'files', grab: 0.5, key: 'n', label: 'Fill' },
        { win: 'files', grab: 0.5, key: 'e0', label: '⅓ right' },
        { win: 'notes', grab: 40, key: 'w2', label: '⅔ left' },
        { win: 'files', grab: 0.5, key: 'c', label: 'Own size' }
    ];
    var MOVE = 0.8, OPEN = 0.25, AIM = 0.7, HOLD = 0.6, DROP = 0.35, REST = 0.5;
    var ACT = MOVE + OPEN + AIM + HOLD + DROP + REST, FADE = 0.4;
    var END = ACTS.length * ACT + 2 * FADE;

    function ease(x) {
        x = Math.min(1, Math.max(0, x));
        return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    }

    function mix(a, b, k) {
        return a + (b - a) * k;
    }

    function mixRect(a, b, k) {
        return { x: mix(a.x, b.x, k), y: mix(a.y, b.y, k), width: mix(a.width, b.width, k), height: mix(a.height, b.height, k) };
    }

    // Where a compass key puts a window of own size `own`.
    function target(key, own) {
        var p = G.compassPlacement(key, opts);
        return p.natural ? G.toAbs(G.naturalFrac(own, AREA), AREA) : G.paddedRect(p.frac, AREA, PAD);
    }

    // Cursor offset from the compass center that hovers `key` (in screen pixels).
    function aim(key) {
        if (key === 'c')
            return { x: 0, y: 0 };
        var g = compass.geo, band = (g.R3 - g.R0) / opts.rings.length;
        var side = key.replace(/\d+$/, ''), ring = Number(key.slice(side.length));
        var deg = { e: 0, s: 90, w: 180, n: 270 }[side];
        var r = side === key ? (g.R0 + g.R3) / 2 : g.R0 + (ring + 0.5) * band;
        return { x: Math.cos(G.rad(deg)) * r * SCALE, y: Math.sin(G.rad(deg)) * r * SCALE };
    }

    function clampCenter(p) {
        var m = (compass.geo.RB + 30) * SCALE;
        return { x: Math.min(Math.max(p.x, m), W - m), y: Math.min(Math.max(p.y, m), H - m) };
    }

    // The whole timeline as keyframes, computed once.
    var plan = (function () {
        var rects = { files: OWN.files, notes: OWN.notes }, order = ['notes', 'files'];
        var cursor = { x: 700, y: 380 }, acts = [];
        ACTS.forEach(function (a) {
            var r = rects[a.win];
            var grab = { x: r.x + (a.grab < 1 ? r.width * a.grab : a.grab), y: r.y + 14 };
            var center = clampCenter(grab), off = aim(a.key);
            var drop = { x: center.x + off.x, y: center.y + off.y };
            var end = target(a.key, OWN[a.win]);
            acts.push({ act: a, from: cursor, grab: grab, center: center, drop: drop, start: r, end: end,
                        rects: { files: rects.files, notes: rects.notes }, order: order.slice() });
            rects[a.win] = end;
            order = order.filter(function (n) { return n !== a.win; }).concat(a.win);
            cursor = drop;
        });
        return { acts: acts, last: { rects: rects, order: order, cursor: cursor } };
    })();

    // State at time t: { rects, order, cursor, compass: { center, key, label } | null, preview, fade }.
    function stateAt(t) {
        t = ((t % END) + END) % END;
        var fade = t < FADE ? t / FADE : t > END - FADE ? (END - t) / FADE : 1;
        var i = Math.floor((t - FADE) / ACT);
        if (t < FADE || i >= plan.acts.length) {
            var first = plan.acts[0];
            return t < FADE ? { rects: first.rects, order: first.order, cursor: first.from, compass: null, preview: null, fade: fade }
                : { rects: plan.last.rects, order: plan.last.order, cursor: plan.last.cursor, compass: null, preview: null, fade: fade };
        }
        var p = plan.acts[i], a = p.act, u = t - FADE - i * ACT;
        var rects = { files: p.rects.files, notes: p.rects.notes }, order = p.order.filter(function (n) { return n !== a.win; }).concat(a.win);
        var s = { rects: rects, order: order, cursor: p.from, compass: null, preview: null, fade: fade };
        if (u < MOVE) {
            s.order = p.order;
            var k = ease(u / MOVE);
            s.cursor = { x: mix(p.from.x, p.grab.x, k), y: mix(p.from.y, p.grab.y, k) };
            return s;
        }
        u -= MOVE;
        var dragging = u < OPEN + AIM + HOLD;
        var k2 = dragging ? ease((u - OPEN) / AIM) : 1;
        var cur = { x: mix(p.grab.x, p.drop.x, k2), y: mix(p.grab.y, p.drop.y, k2) };
        s.cursor = cur;
        var dragged = { x: p.start.x + cur.x - p.grab.x, y: p.start.y + cur.y - p.grab.y, width: p.start.width, height: p.start.height };
        if (dragging) {
            rects[a.win] = dragged;
            var hovering = u >= OPEN + AIM * 0.85;
            s.compass = { center: p.center, key: hovering ? a.key : '', label: hovering ? a.label : '', open: Math.min(1, u / OPEN) };
            s.preview = hovering ? p.end : null;
            return s;
        }
        rects[a.win] = mixRect(dragged, p.end, ease((u - OPEN - AIM - HOLD) / DROP));
        return s;
    }

    function el(name, attrs, parent) {
        var e = document.createElementNS(NS, name);
        for (var k in attrs)
            e.setAttribute(k, attrs[k]);
        if (parent)
            parent.appendChild(e);
        return e;
    }

    function setRect(e, r) {
        e.setAttribute('x', r.x.toFixed(1));
        e.setAttribute('y', r.y.toFixed(1));
        e.setAttribute('width', Math.max(0, r.width).toFixed(1));
        e.setAttribute('height', Math.max(0, r.height).toFixed(1));
    }

    function window_(parent, title) {
        var svg = el('svg', { overflow: 'hidden' }, parent);
        el('rect', { x: 0.5, y: 0.5, width: '100%', height: '100%', rx: 8, class: 'win' }, svg);
        el('line', { x1: 0, y1: 28, x2: '100%', y2: 28, class: 'line' }, svg);
        var t = el('text', { x: 12, y: 18, class: 'title' }, svg);
        t.textContent = title;
        [[44, '62%'], [60, '48%'], [76, '70%'], [92, '40%']].forEach(function (l) {
            el('rect', { x: 12, y: l[0], width: l[1], height: 7, rx: 3, class: 'text' }, svg);
        });
        return svg;
    }

    function make(root) {
        root.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
        var scene = el('g', {}, root);
        el('rect', { x: 0, y: 0, width: W, height: H, class: 'desk' }, scene);
        var wins = { files: window_(scene, 'Files'), notes: window_(scene, 'Notes') };
        var preview = el('rect', { rx: 8, class: 'preview' }, scene);
        var panel = el('g', {}, scene);
        el('rect', { x: 0, y: AREA.height, width: W, height: H - AREA.height, class: 'panel' }, panel);
        [0, 1, 2].forEach(function (i) { el('rect', { x: 14 + i * 30, y: AREA.height + 8, width: 18, height: 18, rx: 4, class: 'text' }, panel); });
        var comp = el('g', { class: 'compass' }, scene);
        var cursor = el('path', { d: 'M0 0L0 17L4.5 13L8 20.5L10.5 19.4L7.2 12.2L12.6 12.2Z', class: 'cursor' }, scene);
        var shownKey = null;

        function render(t) {
            var s = stateAt(t);
            scene.setAttribute('opacity', s.fade.toFixed(3));
            s.order.forEach(function (n) {
                setRect(wins[n], s.rects[n]);
                scene.insertBefore(wins[n], preview); // stacking order: later is on top
            });
            preview.style.display = s.preview ? '' : 'none';
            if (s.preview)
                setRect(preview, s.preview);
            comp.style.display = s.compass ? '' : 'none';
            if (s.compass) {
                var c = s.compass, k = c.key + '|' + c.label;
                comp.setAttribute('transform', 'translate(' + c.center.x.toFixed(1) + ' ' + c.center.y.toFixed(1) + ') scale(' + (SCALE * (0.9 + 0.1 * c.open)).toFixed(3) + ')');
                comp.setAttribute('opacity', c.open.toFixed(2));
                if (k !== shownKey) {
                    comp.innerHTML = compass.markup(c.key, c.label);
                    shownKey = k;
                }
            }
            cursor.setAttribute('transform', 'translate(' + s.cursor.x.toFixed(1) + ' ' + s.cursor.y.toFixed(1) + ')');
        }

        return { render: render };
    }

    return { make: make, END: END };
})();
