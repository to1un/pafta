// SPDX-FileCopyrightText: 2026 to1un
// SPDX-License-Identifier: GPL-3.0-or-later
import QtQuick
import QtCore
import org.kde.kwin
import "../code/geometry.js" as G

Item {
    id: root

    readonly property var defaults: ({
        split: 60,
        outerX: 16,
        outerY: 10,
        innerGap: 8,
        centerWidth: 52,
        centerHeight: 72,
        compassSize: "medium",
        remember: true,
        restoreMaximized: true,
        exceptions: "org.kde.kcalc\nplasmashell\nkrunner\norg.kde.spectacle\norg.freedesktop.impl.portal.desktop.kde\norg.kde.polkit-kde-authentication-agent-1\norg.kde.plasma.emojier",
        debug: false
    })

    property var cfg: ({ exceptions: [], layout: G.DEFAULT_LAYOUT, geo: G.compassGeometry("medium") })
    property var hooks: ({})
    property var records: ({})          // internalId -> { max, frac, output, ts }
    property var memory: ({})           // resourceClass -> { max, frac, output, ts }
    property var pendingRestores: ([])  // active multi-step Wayland restore jobs
    property var drag: null
    property string lastSavedJson: ""

    function log(msg) {
        if (cfg.debug)
            console.log("pafta: " + msg);
    }

    function warn(msg) {
        console.warn("pafta: " + msg);
    }

    function rect(r) {
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    }

    function qrect(r) {
        return Qt.rect(Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height));
    }

    function idOf(w) {
        return String(w.internalId);
    }

    // ---- config -----------------------------------------------------------

    // Read from kwinrc on every drag/shortcut: KWin.readConfig only sees a saved dialog after
    // a KWin reconfigure, which the script config dialog does not trigger.
    function loadConfig() {
        kwinrc.sync();
        const c = {};
        for (const k in defaults) {
            const v = kwinrc.value(k);
            c[k] = v === undefined ? defaults[k] : String(v);
        }
        const choice = (k, list) => {
            const v = /^\d$/.test(String(c[k])) ? list[Number(c[k])] : String(c[k]);
            return list.indexOf(v) >= 0 ? v : defaults[k];
        };
        const flag = k => c[k] === true || c[k] === "true";

        c.compassSize = choice("compassSize", ["small", "medium", "large"]);
        c.remember = flag("remember");
        c.restoreMaximized = flag("restoreMaximized");
        c.debug = flag("debug");
        c.layout = G.normalizeLayout({
            split: c.split,
            outerX: c.outerX,
            outerY: c.outerY,
            innerGap: c.innerGap,
            centerW: c.centerWidth,
            centerH: c.centerHeight
        });
        c.geo = G.compassGeometry(c.compassSize);
        c.exceptions = String(c.exceptions).split(/[\n,]/).map(s => s.trim()).filter(s => s.length > 0);
        cfg = c;
    }

    // ---- helpers ----------------------------------------------------------

    function areaOf(output, desktop) {
        return rect(Workspace.clientArea(KWin.MaximizeArea, output, desktop));
    }

    function desktopOf(w) {
        return (w && w.desktops && w.desktops.length > 0) ? w.desktops[0] : Workspace.currentDesktopForScreen(w ? w.output : Workspace.activeScreen);
    }

    function hookOf(w) {
        return w ? (hooks[idOf(w)] || null) : null;
    }

    function manageable(w) {
        return !!w && w.normalWindow && !w.modal && !w.transient && !w.specialWindow && !w.popupWindow && !w.skipTaskbar
            && !w.deleted && w.moveable && w.resizeable && cfg.exceptions.indexOf(String(w.resourceClass)) < 0;
    }

    function outputNamed(name) {
        if (!name)
            return null;
        return Workspace.screens.find(o => o.name === name) || null;
    }

    function hasSibling(w) {
        const cls = String(w.resourceClass);
        for (const id in hooks) {
            const o = hooks[id].window;
            if (o !== w && !o.deleted && String(o.resourceClass) === cls)
                return true;
        }
        return false;
    }

    // ---- memory & multi-step Wayland restore ------------------------------

    function saveMemory() {
        const json = JSON.stringify(memory);
        if (json !== lastSavedJson) {
            state.memory = json;
            state.sync();
            lastSavedJson = json;
        }
    }

    function snapshotOf(w) {
        if (!w || !w.output)
            return null;
        if (w.maximizeMode === 3)
            return { max: true, output: w.output.name, ts: Date.now() };
        if (w.maximizeMode === 0) {
            const g = rect(w.frameGeometry);
            if (g.width <= 10 || g.height <= 10)
                return null;
            const area = areaOf(w.output, desktopOf(w));
            const frac = G.toFrac(g, area);
            if (!G.validFrac(frac))
                return null;
            const relPos = typeof w.output.mapFromGlobal === "function"
                ? w.output.mapFromGlobal(w.pos || Qt.point(g.x, g.y))
                : { x: g.x - w.output.geometry.x, y: g.y - w.output.geometry.y };
            return {
                max: false,
                frac: frac,
                rel: { x: Math.round(relPos.x), y: Math.round(relPos.y), width: Math.round(g.width), height: Math.round(g.height) },
                areaW: Math.round(area.width),
                areaH: Math.round(area.height),
                output: w.output.name,
                ts: Date.now()
            };
        }
        return null;
    }

    function record(w, flushNow) {
        const hook = hookOf(w);
        if (!hook || !manageable(w) || hook.restoring)
            return;
        const rec = snapshotOf(w);
        if (!rec)
            return;
        records[idOf(w)] = rec;
        if (cfg.remember && w.resourceClass) {
            memory[String(w.resourceClass)] = rec;
            if (flushNow)
                saveMemory();
            else
                saveTimer.restart();
        }
    }

    function liveBackup() {
        for (const id in hooks) {
            const hook = hooks[id];
            const w = hook.window;
            if (!w || w.deleted || hook.restoring || (drag && drag.window === w))
                continue;
            if (manageable(w))
                record(w, false);
        }
        saveMemory();
    }

    function removePendingRestore(id) {
        for (let i = pendingRestores.length - 1; i >= 0; --i) {
            if (pendingRestores[i].id === id)
                pendingRestores.splice(i, 1);
        }
        if (pendingRestores.length === 0)
            restoreTimer.stop();
    }

    function cancelRestore(w) {
        if (!w)
            return;
        const id = idOf(w), hook = hooks[id];
        removePendingRestore(id);
        if (hook) {
            hook.restoring = false;
            hook.userTouched = true;
        }
    }

    function computeRestorePlan(rec, w) {
        const output = outputNamed(rec.output) || w.output;
        if (!output)
            return null;
        if (rec.max)
            return { output: output, max: true, rect: null };
        const area = areaOf(output, Workspace.currentDesktopForScreen(output));
        if (rec.rel && rec.rel.width > 10 && rec.rel.height > 10
                && Math.abs(area.width - (rec.areaW || 0)) <= 4
                && Math.abs(area.height - (rec.areaH || 0)) <= 4) {
            const gp = typeof output.mapToGlobal === "function"
                ? output.mapToGlobal(Qt.point(rec.rel.x, rec.rel.y))
                : { x: output.geometry.x + rec.rel.x, y: output.geometry.y + rec.rel.y };
            const cw = G.clamp(Math.round(rec.rel.width), Math.min(120, area.width), area.width);
            const ch = G.clamp(Math.round(rec.rel.height), Math.min(80, area.height), area.height);
            const cx = G.clamp(Math.round(gp.x), area.x, area.x + area.width - cw);
            const cy = G.clamp(Math.round(gp.y), area.y, area.y + area.height - ch);
            return { output: output, max: false, rect: { x: cx, y: cy, width: cw, height: ch } };
        }
        if (G.validFrac(rec.frac))
            return { output: output, max: false, rect: G.toAbs(rec.frac, area) };
        return null;
    }

    function applyRestore(w, plan) {
        if (!w || w.deleted || !plan)
            return;
        if (plan.max) {
            if (plan.output && w.output !== plan.output)
                Workspace.sendClientToScreen(w, plan.output);
            if (w.tile)
                w.tile.unmanage(w);
            if (w.maximizeMode !== 3)
                w.setMaximize(true, true);
        } else if (plan.rect) {
            if (w.tile)
                w.tile.unmanage(w);
            if (w.maximizeMode !== 0)
                w.setMaximize(false, false);
            const t = plan.rect;
            if (w.x !== t.x || w.y !== t.y || w.width !== t.width || w.height !== t.height)
                w.frameGeometry = Qt.rect(t.x, t.y, t.width, t.height);
        }
    }

    function restoreNow(w) {
        if (!cfg.remember || !w || w.deleted || !manageable(w) || !w.resourceClass)
            return;
        const cls = String(w.resourceClass);
        const rec = memory[cls];
        const id = idOf(w), hook = hooks[id];
        if (!rec || !hook || hook.userTouched || hasSibling(w))
            return;
        const plan = computeRestorePlan(rec, w);
        if (!plan)
            return;

        log("restoring " + cls + " -> " + JSON.stringify(plan));
        hook.restoring = true;
        hook.userTouched = false;
        applyRestore(w, plan);
        records[id] = rec;

        removePendingRestore(id);
        const now = Date.now();
        pendingRestores.push({
            id: id,
            window: w,
            rec: rec,
            plan: plan,
            steps: [now + 250, now + 800],
            stepIdx: 0
        });
        if (!restoreTimer.running)
            restoreTimer.start();
    }

    function restoreOnAdded(w) {
        if (!cfg.remember || !w || !w.normalWindow)
            return;
        if (w.resourceClass)
            restoreNow(w);
        else
            Qt.callLater(() => restoreNow(w));
    }

    // ---- placement --------------------------------------------------------

    function placeSlot(w, output, desktop, slot) {
        if (!w || w.deleted || !manageable(w))
            return;
        cancelRestore(w);
        const area = areaOf(output, desktop);
        const target = G.slotRect(slot, area, cfg.layout);
        if (!target)
            return;
        if (w.tile)
            w.tile.unmanage(w);
        w.setMaximize(false, false);
        setRestore(w, null);
        w.frameGeometry = qrect(target);
        record(w, false);

        // Guard against KWin's top electric-border maximize firing on the same event turn.
        Qt.callLater(() => {
            if (w.deleted || !hooks[idOf(w)])
                return;
            if (w.maximizeMode !== 0 || !G.sameRect(rect(w.frameGeometry), target, 2)) {
                if (w.tile)
                    w.tile.unmanage(w);
                w.setMaximize(false, false);
                w.frameGeometry = qrect(target);
                record(w, false);
            }
        });
    }

    function placeActive(slot) {
        loadConfig();
        const w = Workspace.activeWindow;
        if (!w || !manageable(w))
            return;
        const output = w.output || Workspace.activeScreen;
        placeSlot(w, output, desktopOf(w), slot);
    }

    // ---- drag (Concept A: Top-Edge Compass) -------------------------------

    function moveResizeStarted(w) {
        cancelRestore(w);
        if (!w.move || !manageable(w))
            return;
        loadConfig();
        const p = Workspace.cursorPos;
        const output = Workspace.screenAt(Qt.point(p.x, p.y)) || w.output;
        const desktop = Workspace.currentDesktopForScreen(output);
        const area = areaOf(output, desktop);
        drag = {
            window: w,
            startMax: w.maximizeMode,
            start: where(w),
            open: false,
            hot: "",
            sig: "",
            center: null,
            output: output,
            desktop: desktop,
            area: area
        };
        overlay.vs = rect(Workspace.virtualScreenGeometry);
        overlay.split = cfg.layout.split;
        overlay.geo = cfg.geo;
        overlay.screenArea = area;
        overlay.dragging = true;
        overlay.compassOpen = false;
        overlay.hot = "";
        overlay.preview = null;
        overlay.visible = true;
        poll();
        pollTimer.start();
        log("move start: " + w.resourceClass);
    }

    function poll() {
        const d = drag;
        if (!d)
            return;
        const c = Workspace.cursorPos, p = { x: c.x, y: c.y };
        const output = Workspace.screenAt(Qt.point(p.x, p.y));
        if (!output)
            return;
        if (output !== d.output) {
            d.output = output;
            d.desktop = Workspace.currentDesktopForScreen(output);
            d.area = areaOf(output, d.desktop);
            if (d.open) {
                d.open = false;
                d.hot = "";
            }
        }
        if (!d.open && G.inTopTrigger(p, d.area, G.TOP_TRIGGER_PX)) {
            d.center = G.compassCenterAtTop(p.x, d.area, cfg.geo);
            d.open = true;
            log("compass opened at " + d.center.x + "," + d.center.y);
        } else if (d.open && G.compassDismissed(d.center, p, cfg.geo)) {
            d.open = false;
            d.hot = "";
            log("compass dismissed");
        }
        d.hot = d.open ? G.compassHit(d.center, p, cfg.geo) : "";
        render(d);
    }

    function render(d) {
        const cx = d.center ? d.center.x : 0;
        const cy = d.center ? d.center.y : 0;
        const sig = d.open + "|" + d.hot + "|" + cx + "," + cy + "|" + (d.output ? d.output.name : "");
        if (sig === d.sig)
            return;
        d.sig = sig;
        overlay.screenArea = d.area;
        overlay.dragging = true;
        overlay.compassOpen = d.open;
        overlay.center = d.center || { x: 0, y: 0 };
        overlay.hot = d.hot;
        const slot = G.slotFromCompassKey(d.hot);
        overlay.preview = slot ? G.slotRect(slot, d.area, cfg.layout) : null;
    }

    function endDrag() {
        pollTimer.stop();
        overlay.dragging = false;
        overlay.compassOpen = false;
        overlay.preview = null;
        overlay.hot = "";
        overlay.visible = false;
        drag = null;
    }

    function moveResizeFinished(w) {
        const hook = hookOf(w);
        if (!drag || drag.window !== w) {
            if (hook && !hook.restoring && manageable(w))
                record(w, false);
            return;
        }
        poll();
        const d = drag, slot = G.slotFromCompassKey(d.hot);
        endDrag();
        // Esc cancels the move: KWin restores the starting geometry before this signal.
        if (w.maximizeMode === d.startMax && G.sameRect(rect(w.frameGeometry), d.start.frame, 1)) {
            log("move cancelled; leaving the window where it started");
            return;
        }
        if (slot) {
            log("drop: " + slot);
            placeSlot(w, d.output, d.desktop, slot);
            return;
        }
        record(w, false);
    }

    function tileChanged(w, tile) {
        const id = idOf(w), hook = hooks[id];
        if (hook && hook.restoring)
            return;
        Qt.callLater(() => {
            if (hooks[id] && !hooks[id].restoring && manageable(hooks[id].window))
                record(hooks[id].window, false);
        });
    }

    // ---- maximize ---------------------------------------------------------

    function where(w) {
        return { tile: w.tile, frame: rect(w.frameGeometry), output: w.output };
    }

    function setRestore(w, s) {
        const hook = hookOf(w);
        if (!hook)
            return;
        const on = !!s && cfg.restoreMaximized;
        hook.restore = on ? { frame: s.frame, output: s.output } : null;
        hook.restoreTile = on ? s.tile : null;
    }

    function maximizeAboutToChange(w, mode) {
        const hook = hookOf(w);
        if (hook && hook.restoring)
            return;
        if (w.move || w.resize) {
            setRestore(w, null);
        } else if (mode !== 0 && w.maximizeMode === 0 && manageable(w)) {
            setRestore(w, drag && drag.window === w && drag.startMax === 0 ? drag.start : where(w));
        }
    }

    function maximizeChanged(w) {
        const id = idOf(w), hook = hooks[id];
        if (hook && hook.restoring)
            return;
        if (hook && hook.restore && w.maximizeMode === 0)
            Qt.callLater(() => unmaximized(id));
        else
            Qt.callLater(() => {
                if (hooks[id] && !hooks[id].restoring && manageable(hooks[id].window))
                    record(hooks[id].window, false);
            });
    }

    function unmaximized(id) {
        const hook = hooks[id];
        if (!hook || !hook.restore)
            return;
        const w = hook.window, s = hook.restore, tile = hook.restoreTile;
        setRestore(w, null);
        if (!cfg.restoreMaximized || w.deleted || w.maximizeMode !== 0 || w.tile || w.output !== s.output || !manageable(w))
            return;
        if (tile && tile.manage(w)) {
            log("un-maximized back into its tile");
        } else if (!G.sameRect(rect(w.frameGeometry), s.frame, 1)) {
            w.frameGeometry = qrect(s.frame);
        }
        record(w, false);
    }

    // ---- windows ----------------------------------------------------------

    function addWindow(w) {
        if (!w || !w.normalWindow || hooks[idOf(w)])
            return;
        hooks[idOf(w)] = hookComponent.createObject(root, { window: w, handler: root });
    }

    function windowClosed(w) {
        const id = idOf(w), hook = hooks[id];
        if (drag && drag.window === w)
            endDrag();
        removePendingRestore(id);
        if (hook && !hook.restoring && w.normalWindow && !w.modal && !w.transient && !w.specialWindow && !w.popupWindow
                && !w.skipTaskbar && w.moveable && w.resizeable && cfg.exceptions.indexOf(String(w.resourceClass)) < 0) {
            const rec = snapshotOf(w) || records[id];
            if (rec && cfg.remember && w.resourceClass) {
                memory[String(w.resourceClass)] = rec;
                saveMemory();
                log("remembered on close " + w.resourceClass + " -> " + JSON.stringify(rec));
            }
        }
    }

    Settings {
        id: state
        location: StandardPaths.writableLocation(StandardPaths.GenericDataLocation) + "/pafta/state.ini"
        property string memory: "{}"
    }

    // Read-only: nothing is ever set on it, so it never writes kwinrc back.
    Settings {
        id: kwinrc
        location: StandardPaths.writableLocation(StandardPaths.GenericConfigLocation) + "/kwinrc"
        category: "Script-pafta"
    }

    Component {
        id: hookComponent
        WindowHook {}
    }

    Overlay {
        id: overlay
    }

    ShortcutHandler {
        name: "pafta: Fill"
        text: "pafta: Fill"
        sequence: "Meta+Up"
        onActivated: root.placeActive("fill")
    }

    ShortcutHandler {
        name: "pafta: Left"
        text: "pafta: Left"
        sequence: "Meta+Left"
        onActivated: root.placeActive("left")
    }

    ShortcutHandler {
        name: "pafta: Right"
        text: "pafta: Right"
        sequence: "Meta+Right"
        onActivated: root.placeActive("right")
    }

    ShortcutHandler {
        name: "pafta: Center"
        text: "pafta: Center"
        sequence: "Meta+Down"
        onActivated: root.placeActive("center")
    }

    Timer {
        id: pollTimer
        interval: 25
        repeat: true
        onTriggered: root.poll()
    }

    Timer {
        id: saveTimer
        interval: 250
        onTriggered: root.saveMemory()
    }

    Timer {
        id: liveBackupTimer
        interval: 20000
        repeat: true
        running: true
        onTriggered: root.liveBackup()
    }

    Timer {
        id: restoreTimer
        interval: 50
        repeat: true
        onTriggered: {
            const now = Date.now();
            for (let i = root.pendingRestores.length - 1; i >= 0; --i) {
                const job = root.pendingRestores[i];
                const hook = root.hooks[job.id];
                const w = job.window;
                if (!hook || !w || w.deleted || hook.userTouched || !root.manageable(w)) {
                    if (hook)
                        hook.restoring = false;
                    root.pendingRestores.splice(i, 1);
                    continue;
                }
                if (now >= job.steps[job.stepIdx]) {
                    if (job.plan.max ? w.maximizeMode !== 3 : !G.sameRect(root.rect(w.frameGeometry), job.plan.rect, 2))
                        root.applyRestore(w, job.plan);
                    job.stepIdx++;
                    if (job.stepIdx >= job.steps.length) {
                        hook.restoring = false;
                        root.records[job.id] = job.rec;
                        root.pendingRestores.splice(i, 1);
                    }
                }
            }
            if (root.pendingRestores.length === 0)
                restoreTimer.stop();
        }
    }

    Connections {
        target: Workspace
        function onWindowAdded(w) {
            root.addWindow(w);
            root.restoreOnAdded(w);
        }
        function onWindowRemoved(w) {
            const id = root.idOf(w), hook = root.hooks[id];
            root.removePendingRestore(id);
            if (hook)
                hook.destroy();
            delete root.hooks[id];
            delete root.records[id];
        }
    }

    Connections {
        target: Options
        function onConfigChanged() {
            root.loadConfig();
            root.log("config reloaded");
        }
    }

    Component.onCompleted: {
        try {
            loadConfig();
            try {
                lastSavedJson = state.memory || "{}";
                const m = JSON.parse(lastSavedJson) || {};
                for (const k in m) {
                    if (cfg.exceptions.indexOf(k) < 0 && (m[k].max || G.validFrac(m[k].frac))) {
                        const entry = {
                            max: !!m[k].max,
                            frac: m[k].frac,
                            output: m[k].output || "",
                            ts: m[k].ts || 0
                        };
                        if (m[k].rel && typeof m[k].rel.width === "number" && typeof m[k].rel.height === "number") {
                            entry.rel = m[k].rel;
                            entry.areaW = m[k].areaW || 0;
                            entry.areaH = m[k].areaH || 0;
                        }
                        memory[k] = entry;
                    }
                }
            } catch (e) {
                warn("could not parse the state file: " + e);
            }
            for (const w of Workspace.stackingOrder)
                addWindow(w);
            console.info("pafta: loaded; layout " + JSON.stringify(cfg.layout) + ", compass " + cfg.compassSize
                + ", state " + state.location);
        } catch (e) {
            warn("startup failed: " + e + "\n" + e.stack);
        }
    }
}
