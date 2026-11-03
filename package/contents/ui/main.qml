// SPDX-FileCopyrightText: 2026 to1un
// SPDX-License-Identifier: GPL-3.0-or-later
import QtQuick
import QtCore
import org.kde.kwin
import "../code/geometry.js" as G
import "../code/tiling.js" as T

Item {
    id: root

    readonly property var defaults: ({
        dwellMs: 250,
        compassSize: "medium",
        compassCenter: "centered",
        compassNorth: "maximize",
        compassSouth: "fill",
        compassRings: "33, 50, 67",
        compassCorners: "quarters",
        centeredWidth: 70,
        centeredHeight: 75,
        remember: true,
        restoreMaximized: true,
        exceptions: "org.kde.kcalc\nplasmashell\nkrunner\norg.kde.spectacle",
        debug: false
    })

    property var cfg: ({ exceptions: [] })
    property var hooks: ({})
    property var records: ({})   // internalId -> { frac } | { max }
    property var memory: ({})    // resourceClass -> record
    property var drag: null

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

    function idOf(w) {
        return String(w.internalId);
    }

    // ---- config -----------------------------------------------------------

    // Read from kwinrc on every drag: KWin.readConfig only sees a saved dialog after a KWin
    // reconfigure, which the script config dialog does not trigger.
    function loadConfig() {
        kwinrc.sync();
        const c = {};
        for (const k in defaults) {
            const v = kwinrc.value(k);
            c[k] = v === undefined ? defaults[k] : String(v); // a comma list arrives as a list
        }
        // Enums arrive as choice indices from the config dialog, or as names when written by hand.
        const choice = (k, list) => {
            const v = /^\d$/.test(String(c[k])) ? list[Number(c[k])] : String(c[k]);
            return list.indexOf(v) >= 0 ? v : defaults[k];
        };
        const flag = k => c[k] === true || c[k] === "true";
        const percent = k => Math.min(100, Math.max(10, Number(c[k]) || defaults[k]));
        c.dwellMs = Math.max(100, Number(c.dwellMs) || defaults.dwellMs);
        c.compassSize = choice("compassSize", ["small", "medium", "large"]);
        c.compassCorners = choice("compassCorners", ["off", "quarters", "rings"]);
        c.remember = flag("remember");
        c.restoreMaximized = flag("restoreMaximized");
        c.debug = flag("debug");
        const rings = G.parseRings(c.compassRings);
        if (rings.error)
            warn("invalid compassRings '" + c.compassRings + "', using defaults: " + rings.error);
        c.compass = {
            rings: rings.rings,
            slots: { c: choice("compassCenter", G.SLOT_TYPES), n: choice("compassNorth", G.SLOT_TYPES), s: choice("compassSouth", G.SLOT_TYPES) },
            cw: percent("centeredWidth"),
            ch: percent("centeredHeight"),
            geo: G.compassGeometry(c.compassSize, c.compassCorners)
        };
        c.exceptions = String(c.exceptions).split(/[\n,]/).map(s => s.trim()).filter(s => s.length > 0);
        cfg = c;
    }

    // ---- placement ----------------------------------------------------------

    function areaOf(output, desktop) {
        return rect(Workspace.clientArea(KWin.MaximizeArea, output, desktop));
    }

    function manageable(w) {
        return !!w && w.normalWindow && !w.transient && !w.specialWindow && !w.popupWindow && !w.deleted
            && w.moveable && w.resizeable && cfg.exceptions.indexOf(String(w.resourceClass)) < 0;
    }

    function remember(w, rec) {
        records[idOf(w)] = rec;
    }

    // Into the desktop's own tile when one covers `frac` (drawn with Meta+T), else a plain geometry.
    function placeFrac(w, output, desktop, frac) {
        const r = Workspace.rootTile(output, desktop);
        const tile = r ? T.tileMatching(r, frac) : null;
        if (tile && tile.manage(w)) {
            remember(w, { frac: T.fracOf(tile) });
            return;
        }
        if (w.tile)
            w.tile.unmanage(w);
        w.setMaximize(false, false);
        setRestore(w, null); // placed here, not where it was before it was maximized
        const g = G.paddedRect(frac, areaOf(output, desktop), r ? r.padding : 0);
        w.frameGeometry = Qt.rect(g.x, g.y, g.width, g.height);
        remember(w, { frac: frac });
    }

    // `start`: where a dropped window was when the drag began, to un-maximize it to.
    function placeKey(w, output, desktop, key, start) {
        const p = G.compassPlacement(key, cfg.compass);
        if (p.max) {
            if (w.tile)
                w.tile.unmanage(w);
            w.setMaximize(true, true);
            if (start)
                setRestore(w, start);
            remember(w, { max: true });
        } else {
            placeFrac(w, output, desktop, p.frac);
        }
    }

    // ---- drag -----------------------------------------------------------------

    function moveResizeStarted(w) {
        if (!w.move || !manageable(w))
            return;
        loadConfig();
        const p = Workspace.cursorPos;
        drag = {
            window: w, startMax: w.maximizeMode, start: where(w),
            open: false, hot: "", sig: "",
            anchor: { x: p.x, y: p.y }, anchorTime: Date.now(), center: null,
            output: null, desktop: null, area: null, outGeo: null
        };
        overlay.vs = rect(Workspace.virtualScreenGeometry);
        overlay.compass = cfg.compass;
        pollTimer.start();
        log("move start: " + w.resourceClass);
    }

    function poll() {
        const d = drag;
        if (!d)
            return;
        const c = Workspace.cursorPos, p = { x: c.x, y: c.y }, now = Date.now();
        const output = Workspace.screenAt(Qt.point(p.x, p.y));
        if (!output)
            return;
        if (output !== d.output) {
            d.output = output;
            d.desktop = Workspace.currentDesktopForScreen(output);
            d.area = areaOf(output, d.desktop);
            d.outGeo = rect(output.geometry);
        }

        if (G.dist(p, d.anchor) > 4) {
            d.anchor = p;
            d.anchorTime = now;
        } else if (!d.open && now - d.anchorTime >= cfg.dwellMs) {
            const m = cfg.compass.geo.RB + 30, o = d.outGeo; // room for the compass label below
            d.center = {
                x: Math.min(Math.max(p.x, o.x + m), o.x + o.width - m),
                y: Math.min(Math.max(p.y, o.y + m), o.y + o.height - m)
            };
            d.open = true;
        }
        // Moving well away closes it; drop anywhere then and the window stays where it is.
        if (d.open && G.dist(p, d.center) > 2.5 * cfg.compass.geo.RB) {
            d.open = false;
            d.anchor = p;
            d.anchorTime = now;
        }

        d.hot = d.open ? G.compassHit(d.center, p, cfg.compass.rings.length, cfg.compass.slots, cfg.compass.geo) : "";
        render(d);
    }

    function render(d) {
        const sig = d.open + "|" + d.hot + "|" + (d.output ? d.output.name : "");
        if (sig === d.sig)
            return;
        d.sig = sig;
        overlay.center = d.center || { x: 0, y: 0 };
        overlay.hot = d.hot;
        overlay.preview = d.hot ? G.toAbs(G.compassPlacement(d.hot, cfg.compass).frac, d.area) : null;
        overlay.visible = d.open;
    }

    function endDrag() {
        pollTimer.stop();
        overlay.visible = false;
        drag = null;
    }

    function moveResizeFinished(w) {
        if (!drag || drag.window !== w)
            return;
        poll();
        const d = drag, key = d.hot;
        endDrag();
        // Shift-drag / electric borders are applied before this signal (kwin src/window.cpp:1086-1100).
        if (w.tile) {
            log("KWin tiled the window natively; keeping it");
            remember(w, { frac: T.fracOf(w.tile) });
            return;
        }
        if (w.maximizeMode !== 0 && d.startMax === 0) {
            log("KWin maximized the window; keeping it");
            return;
        }
        if (!key) {
            delete records[idOf(w)];
            return;
        }
        // Esc cancels the move: KWin puts the window back where it started before this signal.
        if (w.maximizeMode === d.startMax && G.sameRect(rect(w.frameGeometry), d.start.frame)) {
            log("move cancelled; leaving the window where it started");
            return;
        }
        log("drop: " + key);
        placeKey(w, d.output, d.desktop, key, d.startMax === 0 ? d.start : null);
    }

    function tileChanged(w, tile) {
        // `tile` notifies asynchronously on Wayland; only positive assignments are recorded.
        if (tile && manageable(w))
            remember(w, { frac: T.fracOf(tile) });
    }

    // ---- maximize -------------------------------------------------------------

    // KWin un-maximizes to its geometryRestore (kwin src/xdgshellwindow.cpp:1778-1832): a tiled
    // window loses its tile and gets its size from before it was tiled, and a window maximized by
    // a drop returns to where it was dropped. Put it back where it was instead, in its tile if any.
    function where(w) {
        return { tile: w.tile, frame: rect(w.frameGeometry), output: w.output };
    }

    function setRestore(w, s) {
        const hook = hooks[idOf(w)];
        if (!hook)
            return;
        const on = !!s && cfg.restoreMaximized;
        hook.restore = on ? { frame: s.frame, output: s.output } : null;
        hook.restoreTile = on ? s.tile : null;
    }

    function maximizeAboutToChange(w, mode) {
        if (w.move || w.resize) {
            setRestore(w, null); // dragged or resized out of it: KWin places it under the cursor
        } else if (mode !== 0 && w.maximizeMode === 0 && manageable(w)) {
            // An electric-border maximize runs before interactiveMoveResizeFinished (kwin src/window.cpp:1088-1102).
            setRestore(w, drag && drag.window === w && drag.startMax === 0 ? drag.start : where(w));
        }
    }

    function maximizeChanged(w) {
        const id = idOf(w), hook = hooks[id];
        // Deferred: when tile.manage() un-maximizes a window, w.tile is set only afterwards (kwin src/window.cpp:3844-3856).
        if (hook && hook.restore && w.maximizeMode === 0)
            Qt.callLater(() => unmaximized(id));
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
            return;
        }
        if (!G.sameRect(rect(w.frameGeometry), s.frame)) {
            log("un-maximized to " + JSON.stringify(s.frame) + " instead of " + JSON.stringify(rect(w.frameGeometry)));
            w.frameGeometry = Qt.rect(s.frame.x, s.frame.y, s.frame.width, s.frame.height);
        }
    }

    // ---- windows & memory -----------------------------------------------------

    function addWindow(w) {
        if (!w || !w.normalWindow || hooks[idOf(w)])
            return;
        hooks[idOf(w)] = hookComponent.createObject(root, { window: w, handler: root });
    }

    function windowClosed(w) {
        if (drag && drag.window === w)
            endDrag();
        const rec = records[idOf(w)];
        if (cfg.remember && rec && w.resourceClass) {
            memory[String(w.resourceClass)] = rec;
            state.memory = JSON.stringify(memory);
            log("remembered " + w.resourceClass + " -> " + JSON.stringify(rec));
        }
    }

    function restore(w) {
        const rec = memory[String(w.resourceClass)];
        if (!rec || w.deleted || !manageable(w))
            return;
        log("restoring " + w.resourceClass + " -> " + JSON.stringify(rec));
        if (rec.max)
            w.setMaximize(true, true);
        else if (G.validFrac(rec.frac))
            placeFrac(w, w.output, Workspace.currentDesktopForScreen(w.output), rec.frac);
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

    Timer {
        id: pollTimer
        interval: 30
        repeat: true
        onTriggered: root.poll()
    }

    Connections {
        target: Workspace
        function onWindowAdded(w) {
            root.addWindow(w);
            if (root.cfg.remember && root.manageable(w) && root.memory[String(w.resourceClass)])
                Qt.callLater(root.restore, w);
        }
        function onWindowRemoved(w) {
            const id = root.idOf(w), hook = root.hooks[id];
            if (hook)
                hook.destroy();
            delete root.hooks[id];
            delete root.records[id];
        }
    }

    // Emitted after KWin re-reads kwinrc (Workspace::slotReconfigure, kwin src/workspace.cpp:1025-1038).
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
                memory = JSON.parse(state.memory) || {};
            } catch (e) {
                warn("could not parse remembered placements: " + e);
            }
            for (const w of Workspace.stackingOrder)
                addWindow(w);
            console.info("pafta: loaded; compass " + cfg.compassSize + " " + cfg.compass.rings.join("/") + ", opens after "
                + cfg.dwellMs + " ms, state " + state.location);
        } catch (e) {
            warn("startup failed: " + e + "\n" + e.stack);
        }
    }
}
