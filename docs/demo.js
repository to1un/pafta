// SPDX-FileCopyrightText: 2026 to1un
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Scripted demo for pafta 2.0.0: free mini-window drag, full-width top-edge 4-sector compass
// (Left 60%, Right 40%, Fill), and Meta+Down Center shortcut. Deterministic render(t) for live
// landing page and headless GIF capture. Needs G (geometry.js) and PaftaCompass (compass.js).
var PaftaDemo = (function () {
    var W = 800, H = 450, AREA = { x: 0, y: 0, width: 800, height: 416 }, SCALE = 0.68;
    var NS = 'http://www.w3.org/2000/svg';
    var LAYOUT = { split: 60, outerX: 12, outerY: 8, innerGap: 6, centerW: 52, centerH: 72 };
    var compass = PaftaCompass(G, { size: 'medium', split: LAYOUT.split, fg: 'currentColor', accent: '#3daee9', base: true });

    var INIT = {
        browser: { x: 90, y: 54, width: 340, height: 240 },
        notes:   { x: 470, y: 80, width: 280, height: 220 },
        mini:    { x: 320, y: 150, width: 170, height: 118 }
    };

    // Acts: free drag of mini window, then top-edge compass drops, then Meta+Down shortcut.
    var ACTS = [
        { type: 'free', win: 'mini', to: { x: 24, y: 274 } },
        { type: 'compass', win: 'browser', key: 'w', label: 'Left 60%' },
        { type: 'compass', win: 'notes', key: 'e', label: 'Right 40%' },
        { type: 'compass', win: 'browser', key: 'n', label: 'Fill' },
        { type: 'shortcut', win: 'notes', key: 's', badge: 'Meta + ↓ · Center' }
    ];

    var MOVE = 0.55, DRAG_FREE = 0.85, TO_TOP = 0.55, OPEN = 0.22, AIM = 0.55, HOLD = 0.55, DROP = 0.30, REST = 0.45;
    var SHORT_SHOW = 0.55, SHORT_ANIM = 0.32, SHORT_REST = 0.70;
    var FADE = 0.35;

    function actDuration(a) {
        if (a.type === 'free') return MOVE + DRAG_FREE + REST;
        if (a.type === 'shortcut') return SHORT_SHOW + SHORT_ANIM + SHORT_REST;
        return MOVE + TO_TOP + OPEN + AIM + HOLD + DROP + REST;
    }

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

    function aimOffset(key) {
        var g = compass.geo;
        var deg = { e: 0, s: 90, w: 180, n: 270 }[key];
        var r = (g.R0 + g.R3) * 0.55 * SCALE;
        return { x: Math.cos(G.rad(deg)) * r, y: Math.sin(G.rad(deg)) * r };
    }

    function topCompassCenter(cursorX) {
        var RB = compass.geo.RB * SCALE;
        return {
            x: G.clamp(Math.round(cursorX), RB + 14, W - RB - 14),
            y: Math.round(RB + 12)
        };
    }

    var plan = (function () {
        var rects = { browser: INIT.browser, notes: INIT.notes, mini: INIT.mini };
        var order = ['browser', 'notes', 'mini'];
        var cursor = { x: 640, y: 340 };
        var acts = [], tCursor = FADE;

        ACTS.forEach(function (a) {
            var dur = actDuration(a);
            var start = rects[a.win];
            var snap = { browser: rects.browser, notes: rects.notes, mini: rects.mini };
            var ord = order.slice();

            if (a.type === 'free') {
                var grab = { x: start.x + start.width * 0.5, y: start.y + 14 };
                var end = { x: a.to.x, y: a.to.y, width: start.width, height: start.height };
                var drop = { x: end.x + end.width * 0.5, y: end.y + 14 };
                acts.push({ act: a, t0: tCursor, dur: dur, from: cursor, grab: grab, drop: drop, start: start, end: end, rects: snap, order: ord });
                rects[a.win] = end;
                order = order.filter(function (n) { return n !== a.win; }).concat(a.win);
                cursor = drop;
            } else if (a.type === 'compass') {
                var grab2 = { x: start.x + start.width * 0.5, y: start.y + 14 };
                var topHit = { x: G.clamp(grab2.x, 90, W - 90), y: 12 };
                var center = topCompassCenter(topHit.x);
                var off = aimOffset(a.key);
                var drop2 = { x: center.x + off.x, y: center.y + off.y };
                var end2 = G.slotRect(G.slotFromCompassKey(a.key), AREA, LAYOUT);
                acts.push({ act: a, t0: tCursor, dur: dur, from: cursor, grab: grab2, topHit: topHit, center: center, drop: drop2, start: start, end: end2, rects: snap, order: ord });
                rects[a.win] = end2;
                order = order.filter(function (n) { return n !== a.win; }).concat(a.win);
                cursor = drop2;
            } else {
                var end3 = G.slotRect(G.slotFromCompassKey(a.key), AREA, LAYOUT);
                acts.push({ act: a, t0: tCursor, dur: dur, from: cursor, start: start, end: end3, rects: snap, order: ord });
                rects[a.win] = end3;
                order = order.filter(function (n) { return n !== a.win; }).concat(a.win);
            }
            tCursor += dur;
        });
        return { acts: acts, last: { rects: rects, order: order, cursor: cursor }, end: tCursor + FADE };
    })();

    var END = plan.end;

    function stateAt(t) {
        t = ((t % END) + END) % END;
        var fade = t < FADE ? t / FADE : t > END - FADE ? (END - t) / FADE : 1;
        if (t < FADE) {
            var f0 = plan.acts[0];
            return { rects: f0.rects, order: f0.order, cursor: f0.from, handle: false, compass: null, preview: null, badge: '', fade: fade };
        }
        var p = null;
        for (var i = 0; i < plan.acts.length; ++i) {
            if (t >= plan.acts[i].t0 && t < plan.acts[i].t0 + plan.acts[i].dur) {
                p = plan.acts[i];
                break;
            }
        }
        if (!p) {
            return { rects: plan.last.rects, order: plan.last.order, cursor: plan.last.cursor, handle: false, compass: null, preview: null, badge: '', fade: fade };
        }

        var a = p.act, u = t - p.t0;
        var rects = { browser: p.rects.browser, notes: p.rects.notes, mini: p.rects.mini };
        var order = p.order.filter(function (n) { return n !== a.win; }).concat(a.win);
        var s = { rects: rects, order: order, cursor: p.from, handle: false, compass: null, preview: null, badge: '', fade: fade };

        if (a.type === 'free') {
            if (u < MOVE) {
                s.order = p.order;
                var k = ease(u / MOVE);
                s.cursor = { x: mix(p.from.x, p.grab.x, k), y: mix(p.from.y, p.grab.y, k) };
                return s;
            }
            u -= MOVE;
            if (u < DRAG_FREE) {
                var kd = ease(u / DRAG_FREE);
                var cur = { x: mix(p.grab.x, p.drop.x, kd), y: mix(p.grab.y, p.drop.y, kd) };
                s.cursor = cur;
                s.handle = true;
                rects[a.win] = { x: p.start.x + cur.x - p.grab.x, y: p.start.y + cur.y - p.grab.y, width: p.start.width, height: p.start.height };
                return s;
            }
            s.cursor = p.drop;
            rects[a.win] = p.end;
            return s;
        }

        if (a.type === 'shortcut') {
            s.badge = a.badge;
            if (u < SHORT_SHOW) {
                return s;
            }
            u -= SHORT_SHOW;
            if (u < SHORT_ANIM) {
                rects[a.win] = mixRect(p.start, p.end, ease(u / SHORT_ANIM));
                return s;
            }
            rects[a.win] = p.end;
            return s;
        }

        // Compass act: move -> drag to top edge -> compass opens -> aim sector -> hold -> drop
        if (u < MOVE) {
            s.order = p.order;
            var km = ease(u / MOVE);
            s.cursor = { x: mix(p.from.x, p.grab.x, km), y: mix(p.from.y, p.grab.y, km) };
            return s;
        }
        u -= MOVE;
        if (u < TO_TOP) {
            var kt = ease(u / TO_TOP);
            var ct = { x: mix(p.grab.x, p.topHit.x, kt), y: mix(p.grab.y, p.topHit.y, kt) };
            s.cursor = ct;
            s.handle = true;
            rects[a.win] = { x: p.start.x + ct.x - p.grab.x, y: p.start.y + ct.y - p.grab.y, width: p.start.width, height: p.start.height };
            return s;
        }
        u -= TO_TOP;
        var inCompass = u < OPEN + AIM + HOLD;
        if (inCompass) {
            var ka = u < OPEN ? 0 : ease((u - OPEN) / AIM);
            var cc = { x: mix(p.topHit.x, p.drop.x, ka), y: mix(p.topHit.y, p.drop.y, ka) };
            s.cursor = cc;
            rects[a.win] = { x: p.start.x + cc.x - p.grab.x, y: p.start.y + cc.y - p.grab.y, width: p.start.width, height: p.start.height };
            var hovering = u >= OPEN + AIM * 0.75;
            s.compass = { center: p.center, key: hovering ? a.key : '', label: hovering ? a.label : '', open: Math.min(1, u / OPEN) };
            s.preview = hovering ? p.end : null;
            return s;
        }
        u -= OPEN + AIM + HOLD;
        s.cursor = p.drop;
        var fromDrop = { x: p.start.x + p.drop.x - p.grab.x, y: p.start.y + p.drop.y - p.grab.y, width: p.start.width, height: p.start.height };
        rects[a.win] = mixRect(fromDrop, p.end, ease(u / DROP));
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

    function window_(parent, title, accentDot) {
        var svg = el('svg', { overflow: 'hidden' }, parent);
        el('rect', { x: 0.5, y: 0.5, width: '100%', height: '100%', rx: 8, class: 'win' }, svg);
        el('line', { x1: 0, y1: 26, x2: '100%', y2: 26, class: 'line' }, svg);
        el('rect', { x: 10, y: 9, width: 8, height: 8, rx: 2, fill: accentDot }, svg);
        var t = el('text', { x: 24, y: 17, class: 'title' }, svg);
        t.textContent = title;
        [[42, '60%'], [56, '44%'], [70, '68%'], [84, '38%']].forEach(function (l) {
            el('rect', { x: 12, y: l[0], width: l[1], height: 6, rx: 3, class: 'text' }, svg);
        });
        return svg;
    }

    function make(root) {
        root.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
        var scene = el('g', {}, root);
        el('rect', { x: 0, y: 0, width: W, height: H, class: 'desk' }, scene);

        var wins = {
            browser: window_(scene, 'Browser', '#1d99f3'),
            notes:   window_(scene, 'Notes', '#8b5cf6'),
            mini:    window_(scene, 'Keysmith', '#10b981')
        };
        var preview = el('rect', { rx: 8, class: 'preview' }, scene);
        var handle = el('rect', { x: (W - 76) / 2, y: 4, width: 76, height: 4, rx: 2, class: 'handle' }, scene);

        var panel = el('g', {}, scene);
        el('rect', { x: 0, y: AREA.height, width: W, height: H - AREA.height, class: 'panel' }, panel);
        [0, 1, 2].forEach(function (i) {
            el('rect', { x: 14 + i * 28, y: AREA.height + 8, width: 18, height: 18, rx: 4, class: 'text' }, panel);
        });

        var comp = el('g', { class: 'compass' }, scene);
        var badgeG = el('g', { class: 'badge' }, scene);
        var badgeRect = el('rect', { x: W / 2 - 86, y: AREA.height - 46, width: 172, height: 28, rx: 14, class: 'badge-bg' }, badgeG);
        var badgeText = el('text', { x: W / 2, y: AREA.height - 28, 'text-anchor': 'middle', class: 'badge-txt' }, badgeG);
        var cursor = el('path', { d: 'M0 0L0 17L4.5 13L8 20.5L10.5 19.4L7.2 12.2L12.6 12.2Z', class: 'cursor' }, scene);
        var shownKey = null;

        function render(t) {
            var s = stateAt(t);
            scene.setAttribute('opacity', s.fade.toFixed(3));
            s.order.forEach(function (n) {
                setRect(wins[n], s.rects[n]);
                scene.insertBefore(wins[n], preview);
            });
            preview.style.display = s.preview ? '' : 'none';
            if (s.preview)
                setRect(preview, s.preview);
            handle.style.display = s.handle ? '' : 'none';
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
            badgeG.style.display = s.badge ? '' : 'none';
            if (s.badge) {
                badgeText.textContent = s.badge;
                var bw = Math.max(136, s.badge.length * 8 + 26);
                badgeRect.setAttribute('x', (W / 2 - bw / 2).toFixed(1));
                badgeRect.setAttribute('width', bw.toFixed(1));
            }
            cursor.setAttribute('transform', 'translate(' + s.cursor.x.toFixed(1) + ' ' + s.cursor.y.toFixed(1) + ')');
        }

        return { render: render };
    }

    return { make: make, END: END };
})();
