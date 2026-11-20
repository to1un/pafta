# SPDX-FileCopyrightText: 2026 to1un
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Writes package/contents/ui/config.ui (Qt Designer XML is too verbose to edit by hand).
#   python3 tools/gen-config-ui.py
import base64, html, os, subprocess, xml.dom.minidom

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

def compass_img():
    svg = subprocess.run(["node", os.path.join(ROOT, "tools", "compass-svg.js"), "large", "w", "Left 60%", "60"],
                         check=True, capture_output=True, text=True).stdout
    b = base64.b64encode(svg.encode()).decode()
    return html.escape('<img src="data:image/svg+xml;base64,%s">' % b)

def esc(s):
    return html.escape(s, quote=False)

def label(text, wrap=False):
    out = '<widget class="QLabel"><property name="text"><string>%s</string></property>' % esc(text)
    if wrap:
        out += '<property name="wordWrap"><bool>true</bool></property>'
    return out + '</widget>'

def combo(name, items, tip=None):
    out = '<widget class="QComboBox" name="kcfg_%s">' % name
    if tip:
        out += '<property name="toolTip"><string>%s</string></property>' % esc(tip)
    for i in items:
        out += '<item><property name="text"><string>%s</string></property></item>' % esc(i)
    return out + '</widget>'

def spin(name, lo, hi, step, suffix, tip=None):
    extra = ''
    if tip:
        extra += '<property name="toolTip"><string>%s</string></property>' % esc(tip)
    return ('<widget class="QSpinBox" name="kcfg_%s"><property name="minimum"><number>%d</number></property>'
            '<property name="maximum"><number>%d</number></property><property name="singleStep"><number>%d</number></property>'
            '<property name="suffix"><string>%s</string></property>%s</widget>') % (name, lo, hi, step, esc(suffix), extra)

def check(name, text, tip=None):
    out = '<widget class="QCheckBox" name="kcfg_%s"><property name="text"><string>%s</string></property>' % (name, esc(text))
    if tip:
        out += '<property name="toolTip"><string>%s</string></property>' % esc(tip)
    return out + '</widget>'

def form(name, rows, compact=False):
    out = '<layout class="QFormLayout" name="%s">' % name
    if compact:
        out += '<property name="fieldGrowthPolicy"><enum>QFormLayout::FieldsStayAtSizeHint</enum></property>'
    for i, (l, w) in enumerate(rows):
        if l is None:
            out += '<item row="%d" column="1">%s</item>' % (i, w)
        else:
            out += '<item row="%d" column="0">%s</item><item row="%d" column="1">%s</item>' % (i, label(l), i, w)
    return out + '</layout>'

def tab(name, title, body):
    return ('<widget class="QWidget" name="%s"><attribute name="title"><string>%s</string></attribute>'
            '<layout class="QVBoxLayout" name="%sLayout">%s<item><spacer name="%sSpacer"><property name="orientation">'
            '<enum>Qt::Vertical</enum></property><property name="sizeHint"><size><width>0</width><height>0</height></size></property></spacer></item></layout></widget>') % (name, esc(title), name, body, name)

def stretch(name, orientation):
    return ('<item><spacer name="%s"><property name="orientation"><enum>Qt::%s</enum></property>'
            '<property name="sizeHint"><size><width>0</width><height>0</height></size></property></spacer></item>') % (name, orientation)

layout_form = form("layoutForm", [
    ("Left split:", spin("split", 25, 75, 5, " %", "Left column percentage; right column uses the remainder.")),
    ("Outer left / right (X):", spin("outerX", 0, 80, 2, " px", "Horizontal margin against the left and right screen edges.")),
    ("Outer top / bottom (Y):", spin("outerY", 0, 80, 2, " px", "Vertical margin against the top and bottom screen edges.")),
    ("Inner gap:", spin("innerGap", 0, 60, 2, " px", "Gap between Left and Right columns.")),
    ("Center size:", '<layout class="QHBoxLayout" name="centeredRow"><item>%s</item><item>%s</item><item>%s</item>'
                     '<item><spacer name="centeredSpacer"><property name="orientation"><enum>Qt::Horizontal</enum></property><property name="sizeHint"><size><width>0</width><height>0</height></size></property></spacer></item></layout>'
                     % (spin("centerWidth", 20, 95, 2, " %", "Center box width"), label("×"), spin("centerHeight", 20, 95, 2, " %", "Center box height"))),
    ("Compass size:", combo("compassSize", ["Small", "Medium", "Large"])),
], compact=True)

help_text = label("Drag any window freely anywhere on screen. Pull to the top edge to open the 4-sector compass "
                  "(West = Left split, East = Right split, North = Fill, South = Center, Hub = Free). "
                  "Pull down to dismiss, or use Meta+Left / Meta+Right / Meta+Up / Meta+Down.", wrap=True
                  ).replace('</widget>', '<property name="maximumWidth"><number>440</number></property></widget>')

layout_body = (stretch("compassTop", "Vertical")
               + '<item><layout class="QHBoxLayout" name="compassRow">'
               + stretch("compassLeft", "Horizontal")
               + '<item><widget class="QLabel" name="compassPreview"><property name="text"><string>%s</string></property>'
                 '<property name="alignment"><set>Qt::AlignVCenter|Qt::AlignHCenter</set></property></widget></item>' % compass_img()
               + '<item><spacer name="compassGap"><property name="orientation"><enum>Qt::Horizontal</enum></property>'
                 '<property name="sizeType"><enum>QSizePolicy::Fixed</enum></property><property name="sizeHint"><size><width>24</width><height>0</height></size></property></spacer></item>'
               + '<item><layout class="QVBoxLayout" name="compassSide">' + stretch("sideTop", "Vertical")
               + '<item>%s</item><item>%s</item>' % (layout_form, help_text) + stretch("sideBottom", "Vertical") + '</layout></item>'
               + stretch("compassRight", "Horizontal")
               + '</layout></item>')

behavior_body = '<item>%s</item><item>%s</item>' % (form("behaviorForm", [
    (None, check("remember", "Remember where applications were placed",
                 "Saves moves, resizes, slots, and maximized states immediately and restores the app's first window on Wayland.")),
    (None, check("restoreMaximized", "Un-maximize windows back to their previous position")),
    (None, check("debug", "Debug logging")),
]), label("pafta uses its own frameGeometry layout and never modifies Plasma Meta+T tiles.", wrap=True))

exceptions_body = '<item>%s</item><item>%s</item>' % (
    label("Window classes pafta leaves alone, one per line:", wrap=True),
    '<widget class="QPlainTextEdit" name="kcfg_exceptions"/>')

ui = ('<?xml version="1.0" encoding="UTF-8"?>\n'
      '<!-- SPDX-FileCopyrightText: 2026 to1un -->\n'
      '<!-- SPDX-License-Identifier: GPL-3.0-or-later -->\n'
      '<ui version="4.0"><class>KWin::PaftaConfigForm</class>'
      '<widget class="QWidget" name="KWin::PaftaConfigForm"><layout class="QVBoxLayout" name="mainLayout">'
      '<item><widget class="QTabWidget" name="tabs">%s%s%s</widget></item>'
      '<item>%s</item>'
      '</layout></widget><resources/><connections/></ui>\n') % (
    tab("layoutTab", "Layout && Compass", layout_body),
    tab("behaviorTab", "Behavior", behavior_body),
    tab("exceptionsTab", "Exceptions", exceptions_body),
    label("Changes apply on the next drag or shortcut.", wrap=True))

body = xml.dom.minidom.parseString(ui).toprettyxml(indent="  ").split("\n", 1)[1]
lines = [l for l in body.splitlines() if l.strip() and not l.strip().startswith("<!-- SPDX")]
out = os.path.join(os.path.dirname(__file__), "..", "package", "contents", "ui", "config.ui")
with open(out, "w") as f:
    f.write(ui.split("<ui ", 1)[0] + "\n".join(lines) + "\n")
