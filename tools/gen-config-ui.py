# SPDX-FileCopyrightText: 2026 to1un
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Writes package/contents/ui/config.ui (Qt Designer XML is too verbose to edit by hand).
#   python3 tools/gen-config-ui.py
import base64, html, os, xml.dom.minidom

SVG = """<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="-110 -110 220 220" font-family="sans-serif" font-size="11" text-anchor="middle">
<circle r="104" fill="none" stroke="#888" stroke-width="1.5"/>
<circle r="86" fill="#3b82f6" fill-opacity=".06" stroke="#888" stroke-opacity=".6"/>
<g stroke="#888" stroke-opacity=".5">
<line x1="15.3" y1="-6.3" x2="79.5" y2="-32.9"/><line x1="6.3" y1="-15.3" x2="32.9" y2="-79.5"/>
<line x1="-6.3" y1="-15.3" x2="-32.9" y2="-79.5"/><line x1="-15.3" y1="-6.3" x2="-79.5" y2="-32.9"/>
<line x1="-15.3" y1="6.3" x2="-79.5" y2="32.9"/><line x1="-6.3" y1="15.3" x2="-32.9" y2="79.5"/>
<line x1="6.3" y1="15.3" x2="32.9" y2="79.5"/><line x1="15.3" y1="6.3" x2="79.5" y2="32.9"/>
</g>
<g fill="none" stroke="#888" stroke-dasharray="2 3">
<path d="M 33.9 -14.0 A 36.7 36.7 0 0 1 33.9 14.0"/><path d="M 56.1 -23.2 A 60.7 60.7 0 0 1 56.1 23.2"/>
<path d="M -33.9 -14.0 A 36.7 36.7 0 0 0 -33.9 14.0"/><path d="M -56.1 -23.2 A 60.7 60.7 0 0 0 -56.1 23.2"/>
</g>
<circle r="16" fill="#3b82f6" fill-opacity=".35" stroke="#3b82f6"/>
<g fill="#888">
<text y="4">hub</text>
<text y="-52">N</text><text y="58">S</text>
<text x="-52" y="-60">↖</text><text x="52" y="-60">↗</text><text x="-52" y="68">↙</text><text x="52" y="68">↘</text>
<text x="-27" y="4" font-size="9">⅓</text><text x="-48" y="4" font-size="9">½</text><text x="-72" y="4" font-size="9">⅔</text>
<text x="27" y="4" font-size="9">⅓</text><text x="48" y="4" font-size="9">½</text><text x="72" y="4" font-size="9">⅔</text>
<text x="-96" y="4" font-weight="bold">W</text><text x="96" y="4" font-weight="bold">E</text>
</g>
</svg>"""

def img():
    b = base64.b64encode(SVG.encode()).decode()
    return html.escape('<img src="data:image/svg+xml;base64,%s" width="220" height="220">' % b)

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

def form(name, rows):
    out = '<layout class="QFormLayout" name="%s">' % name
    for i, (l, w) in enumerate(rows):
        if l is None:
            out += '<item row="%d" column="1">%s</item>' % (i, w)
        else:
            out += '<item row="%d" column="0">%s</item><item row="%d" column="1">%s</item>' % (i, label(l), i, w)
    return out + '</layout>'

def tab(name, title, body):
    return ('<widget class="QWidget" name="%s"><attribute name="title"><string>%s</string></attribute>'
            '<layout class="QVBoxLayout" name="%sLayout">%s<item><spacer name="%sSpacer"><property name="orientation">'
            '<enum>Qt::Vertical</enum></property></spacer></item></layout></widget>') % (name, esc(title), name, body, name)

SLOTS = ["Own size, centered", "Centered window", "Fill the screen (not maximized)", "Maximize", "Top half", "Bottom half", "Nothing"]

compass_form = form("compassForm", [
    ("Opens after:", spin("dwellMs", 0, 1000, 50, " ms", "Immediately", "How long the cursor rests before the compass opens. Immediately: it opens as soon as you grab the window, once per drag.")),
    ("Size:", combo("compassSize", ["Small", "Medium", "Large"])),
    ("Center:", combo("compassCenter", SLOTS)),
    ("North:", combo("compassNorth", SLOTS)),
    ("South:", combo("compassSouth", SLOTS)),
    ("West and east widths:", '<widget class="QLineEdit" name="kcfg_compassRings"><property name="toolTip"><string>One to four percentages, narrowest nearest the center.</string></property><property name="placeholderText"><string>33, 50, 67</string></property></widget>'),
    ("Diagonals:", combo("compassCorners", ["Off", "Corner quarters", "Corner quarters in the widths above"])),
    ("Centered window width:", spin("centeredWidth", 10, 100, 5, " %")),
    ("Centered window height:", spin("centeredHeight", 10, 100, 5, " %")),
])

compass_body = ('<item><layout class="QHBoxLayout" name="compassRow"><item>'
                '<widget class="QLabel" name="compassPreview"><property name="text"><string>%s</string></property>'
                '<property name="alignment"><set>Qt::AlignTop|Qt::AlignHCenter</set></property></widget></item>'
                '<item>%s</item></layout></item>'
                '<item>%s</item>') % (img(), compass_form, label(
                    "Drag a window and rest the cursor: the compass opens around it. Drop on a slot to place the window. Own size: the size the application first opened with, or the size you last gave it by hand. "
                    "Move away from the compass and drop to leave the window where it is. Esc cancels the move.", wrap=True))

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
