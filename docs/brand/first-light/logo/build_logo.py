"""Builds First Light logo SVGs (symbol, outlined Outfit Black wordmark, lockups, app icons).
Usage: pip install fonttools uharfbuzz; put Outfit[wght].ttf at logo/fonts/Outfit-var.ttf; python build_logo.py <out-dir>"""
import os, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import uharfbuzz as hb

S = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

FERN, FOREST, CREAM, PAPER = "#4F6B3A", "#1E2A22", "#F4EEDC", "#FDFDFB"
FERN_LIGHT = "#A3B98C"

# ---------- symbol (star rising over a horizon arc), drawn in a 120 x 80 box ----------
def star(cx, cy, rv, rh, pinch):
    """Four-point star with concave sides. rv/rh: vertical/horizontal half sizes. pinch: control offset from center."""
    t, b, l, r = cy - rv, cy + rv, cx - rh, cx + rh
    p = pinch
    return (f"M{cx},{t} Q{cx+p},{cy-p} {r},{cy} Q{cx+p},{cy+p} {cx},{b} "
            f"Q{cx-p},{cy+p} {l},{cy} Q{cx-p},{cy-p} {cx},{t} Z")

def arc(x0, x1, y_end, apex, thick, end_thick):
    """Crescent-like horizon: thick in the middle, tapering to soft ends."""
    c_out = 2 * apex - y_end
    c_in = 2 * (apex + thick) - (y_end + end_thick)
    e = end_thick / 2
    return (f"M{x0},{y_end-e} Q60,{c_out-e} {x1},{y_end-e} "
            f"A{e},{e} 0 0 1 {x1},{y_end+e} "
            f"Q60,{c_in+e} {x0},{y_end+e} A{e},{e} 0 0 1 {x0},{y_end-e} Z")

SYMBOL = {
    # regular: thin elegant arc, used at 24px and up
    "regular": [star(60, 26, 23, 19, 5.2), arc(4, 116, 74, 54, 5.5, 2.0)],
    # small: thicker arc and plumper star, used at 16-20px (favicon, toolbar)
    "small": [star(60, 24, 24, 22, 7.5), arc(6, 114, 76, 54, 12, 6)],
}

def symbol_paths(kind, fill):
    return "".join(f'<path d="{d}" fill="{fill}"/>' for d in SYMBOL[kind])

# ---------- wordmark: "no-fomo." outlined from Outfit at weight 900 ----------
font_path = os.path.join(S, "fonts", "Outfit-var.ttf")
tt = TTFont(font_path)
inst = instantiateVariableFont(tt, {"wght": 900})
inst_path = os.path.join(S, "fonts", "Outfit-Black-instance.ttf")
inst.save(inst_path)
font = TTFont(inst_path)
gs = font.getGlyphSet()
upm = font["head"].unitsPerEm

blob = hb.Blob.from_file_path(inst_path)
hbfont = hb.Font(hb.Face(blob))
TEXT = "no-fomo."
buf = hb.Buffer(); buf.add_str(TEXT); buf.guess_segment_properties()
hb.shape(hbfont, buf, {"kern": True, "liga": True})
TRACK = -0.02 * upm  # slight tightening, as in the approved board
names = font.getGlyphOrder()

pen = SVGPathPen(gs)
x = 0
for i, (info, pos) in enumerate(zip(buf.glyph_infos, buf.glyph_positions)):
    g = names[info.codepoint]
    tp = TransformPen(pen, (1, 0, 0, -1, x + pos.x_offset, 0))  # flip y
    gs[g].draw(tp)
    x += pos.x_advance + (TRACK if i < len(buf.glyph_infos) - 1 else 0)
WORD_D = pen.getCommands()
WORD_W = x
os2 = font["OS/2"]
XH = os2.sxHeight  # x-height in font units
ASC = os2.sTypoAscender

def wordmark(fill, scale, tx, ty):
    return f'<path transform="translate({tx:.2f},{ty:.2f}) scale({scale:.5f})" d="{WORD_D}" fill="{fill}"/>'

def svg(w, h, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2f} {h:.2f}" width="{w:.0f}" height="{h:.0f}" role="img" aria-label="{title}">'
            f"<title>{title}</title>{body}</svg>\n")

def write(name, content):
    with open(os.path.join(OUT, name), "w") as f:
        f.write(content)

# symbol alone
for kind in ("regular", "small"):
    for cname, col in (("fern", FERN), ("forest", FOREST), ("cream", CREAM), ("fern-light", FERN_LIGHT)):
        write(f"symbol-{kind}-{cname}.svg", svg(120, 80, symbol_paths(kind, col), "no-fomo"))
# currentColor symbol for inline use in React
write("symbol-currentcolor.svg", svg(120, 80, symbol_paths("regular", "currentColor"), "no-fomo"))
write("symbol-small-currentcolor.svg", svg(120, 80, symbol_paths("small", "currentColor"), "no-fomo"))

# wordmark alone: height = cap/x region; place baseline
WM_H = 100  # target x-height in px units for the standalone file
s = WM_H / XH
ascent_px = ASC * s
desc_px = 0.22 * upm * s
wm_w = WORD_W * s
for cname, col in (("forest", FOREST), ("cream", CREAM)):
    write(f"wordmark-{cname}.svg", svg(wm_w, ascent_px * 0.82 + desc_px, wordmark(col, s, 0, ascent_px * 0.82), "no-fomo."))

# horizontal lockup: symbol height ~ 1.55 x-height, wordmark baseline aligned to arc bottom area
def horizontal(sym_col, word_col):
    xh = 60.0
    sc = xh / XH
    sym_scale = (xh * 1.8) / 80  # symbol box height relative to x-height
    sym_w = 120 * sym_scale
    gap = xh * 0.42
    top_pad = (80 * sym_scale)
    baseline = top_pad * 0.86
    body = f'<g transform="scale({sym_scale:.4f})">{symbol_paths("regular", sym_col)}</g>'
    body += wordmark(word_col, sc, sym_w + gap, baseline)
    w = sym_w + gap + WORD_W * sc
    h = max(top_pad, baseline + 0.06 * upm * sc)
    return svg(w, h, body, "no-fomo.")

write("lockup-horizontal-light.svg", horizontal(FERN, FOREST))
write("lockup-horizontal-dark.svg", horizontal(FERN_LIGHT, CREAM))
write("lockup-horizontal-mono-cream.svg", horizontal(CREAM, CREAM))

# stacked lockup
def stacked(sym_col, word_col):
    xh = 60.0
    sc = xh / XH
    word_w = WORD_W * sc
    sym_scale = word_w * 0.7 / 120
    sym_w, sym_h = 120 * sym_scale, 80 * sym_scale
    gap = xh * 0.55
    baseline = sym_h + gap + xh * 1.0
    body = f'<g transform="translate({(word_w - sym_w)/2:.2f},0) scale({sym_scale:.4f})">{symbol_paths("regular", sym_col)}</g>'
    body += wordmark(word_col, sc, 0, baseline)
    return svg(word_w, baseline + xh * 0.12, body, "no-fomo.")

write("lockup-stacked-light.svg", stacked(FERN, FOREST))
write("lockup-stacked-cream.svg", stacked(CREAM, CREAM))

# app icons 1024: fern, forest, dawn gradient
def app_icon(bg_fill, defs="", kind="regular", sym_col=CREAM):
    size, r = 1024, 230
    sym_scale = 1024 * (0.86 if kind == "small" else 0.68) / 120
    sym_w, sym_h = 120 * sym_scale, 80 * sym_scale
    tx, ty = (size - sym_w) / 2, (size - sym_h) / 2 + 10
    body = defs + f'<rect width="{size}" height="{size}" rx="{r}" fill="{bg_fill}"/>'
    body += f'<g transform="translate({tx:.2f},{ty:.2f}) scale({sym_scale:.4f})">{symbol_paths(kind, sym_col)}</g>'
    return svg(size, size, body, "no-fomo")

DAWN_DEFS = ('<defs><linearGradient id="dawn" x1="0" y1="0" x2="0" y2="1">'
             '<stop offset="0" stop-color="#2F6B6B"/><stop offset="0.55" stop-color="#5E8C84"/>'
             '<stop offset="1" stop-color="#A9BFA6"/></linearGradient></defs>')
write("app-icon-fern.svg", app_icon(FERN))
write("app-icon-forest.svg", app_icon(FOREST))
write("app-icon-dawn.svg", app_icon("url(#dawn)", DAWN_DEFS))
# small-size icons (favicon / extension) use the thick symbol
write("app-icon-fern-small.svg", app_icon(FERN, kind="small"))
write("app-icon-dawn-small.svg", app_icon("url(#dawn)", DAWN_DEFS, kind="small"))

print("word width units", WORD_W, "x-height", XH)
