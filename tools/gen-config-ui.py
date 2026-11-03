# SPDX-FileCopyrightText: 2026 to1un
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Writes package/contents/ui/config.ui (Qt Designer XML is too verbose to edit by hand).
#   python3 tools/gen-config-ui.py
import base64, html, os, subprocess, xml.dom.minidom

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

# The compass as drawn while dragging, from the same geometry (tools/compass-svg.js).
SVG = subprocess.run(["node", os.path.join(ROOT, "tools", "compass-svg.js"), "large", "quarters"],
                     check=True, capture_output=True, text=True).stdout

def img():
    b = base64.b64encode(SVG.encode()).decode()
    return html.escape('<img src="data:image/svg+xml;base64,%s">' % b)

def esc(s):
    return html.escape(s, quote=False)

def label(text, wrap=False, rich=False):
    out = '<widget class="QLabel"><property name="text"><string>%s</string></property>' % esc(text)
    if rich:
        out += '<property name="textFormat"><enum>Qt::RichText</enum></property>'
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

def spin(name, lo, hi, step, suffix, special=None, tip=None):
    extra = ''
    if special:
        extra += '<property name="specialValueText"><string>%s</string></property>' % esc(special)
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

SLOTS = ["Own size, centered", "Centered window", "Fill the screen (not maximized)", "Maximize", "Top half", "Bottom half", "Nothing"]

compass_form = form("compassForm", [
    ("Opens after:", spin("dwellMs", 0, 1000, 50, " ms", "Immediately",
                          "How long the cursor rests before the compass opens. Immediately: as soon as you grab the window, once per drag.")),
    ("Size:", combo("compassSize", ["Small", "Medium", "Large"])),
    ("Center:", combo("compassCenter", SLOTS)),
    ("North:", combo("compassNorth", SLOTS)),
    ("South:", combo("compassSouth", SLOTS)),
    ("West and east:", '<widget class="QLineEdit" name="kcfg_compassRings"><property name="toolTip"><string>Widths in percent, one to four, narrowest nearest the center.</string></property>'
                       '<property name="placeholderText"><string>33, 50, 67</string></property><property name="maximumWidth"><number>140</number></property></widget>'),
    ("Diagonals:", combo("compassCorners", ["Off", "Corner quarters", "Corner quarters in the widths above"])),
    ("Centered window:", '<layout class="QHBoxLayout" name="centeredRow"><item>%s</item><item>%s</item><item>%s</item>'
                         '<item><spacer name="centeredSpacer"><property name="orientation"><enum>Qt::Horizontal</enum></property><property name="sizeHint"><size><width>0</width><height>0</height></size></property></spacer></item></layout>'
                         % (spin("centeredWidth", 10, 100, 5, " %", tip="Width"), label("×"), spin("centeredHeight", 10, 100, 5, " %", tip="Height"))),
], compact=True)

help_text = label("Grab a window and the compass opens around the cursor; drop on a slot to place the window. "
                  "Own size is the size the application first opened with, or the size you last gave it by hand. "
                  "Move away from the compass and drop to leave the window where it is; Esc cancels the move.", wrap=True
                  ).replace('</widget>', '<property name="maximumWidth"><number>440</number></property></widget>')

def stretch(name, orientation):
    return ('<item><spacer name="%s"><property name="orientation"><enum>Qt::%s</enum></property>'
            '<property name="sizeHint"><size><width>0</width><height>0</height></size></property></spacer></item>') % (name, orientation)

# Compass and form as one block, centered in the tab both ways (tab() adds the bottom stretch).
compass_body = (stretch("compassTop", "Vertical")
                + '<item><layout class="QHBoxLayout" name="compassRow">'
                + stretch("compassLeft", "Horizontal")
                + ('<item><widget class="QLabel" name="compassPreview"><property name="text"><string>%s</string></property>'
                   '<property name="alignment"><set>Qt::AlignVCenter|Qt::AlignHCenter</set></property></widget></item>') % img()
                + '<item><spacer name="compassGap"><property name="orientation"><enum>Qt::Horizontal</enum></property>'
                  '<property name="sizeType"><enum>QSizePolicy::Fixed</enum></property><property name="sizeHint"><size><width>24</width><height>0</height></size></property></spacer></item>'
                + '<item><layout class="QVBoxLayout" name="compassSide"><item>%s</item><item>%s</item></layout></item>' % (compass_form, help_text)
                + stretch("compassRight", "Horizontal")
                + '</layout></item>')

behavior_body = '<item>%s</item><item>%s</item>' % (form("behaviorForm", [
    (None, check("remember", "Remember where applications were placed",
                 "When an application closes, its tile, position or maximized state is saved and restored the next time it opens.")),
    (None, check("restoreMaximized", "Un-maximize windows to where they were, back into their tile")),
    (None, check("debug", "Debug logging")),
]), label("Layouts come from Plasma: press Meta+T to draw the tiles of each virtual desktop, and drag with Shift to drop "
          "a window into them. The compass never puts windows into tiles, so they stay free to resize.", wrap=True))

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
    tab("compassTab", "Compass", compass_body),
    tab("behaviorTab", "Behavior", behavior_body),
    tab("exceptionsTab", "Exceptions", exceptions_body),
    label("Changes apply to the next drag.", wrap=True))

body = xml.dom.minidom.parseString(ui).toprettyxml(indent="  ").split("\n", 1)[1]
lines = [l for l in body.splitlines() if l.strip() and not l.strip().startswith("<!-- SPDX")]
out = os.path.join(os.path.dirname(__file__), "..", "package", "contents", "ui", "config.ui")
with open(out, "w") as f:
    f.write(ui.split("<ui ", 1)[0] + "\n".join(lines) + "\n")
