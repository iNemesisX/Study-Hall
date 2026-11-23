"""Draws the Study Hall icon and writes every size the platforms need.
Run: python3 build/make-icons.py   (needs Pillow). The outputs are committed, so
builds don't need to run this."""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 1024
PURPLE = (90, 69, 194, 255)


def artwork(size=S, tile=True, pad=40):
    """The open notebook. tile=False draws it without the rounded background (Android adaptive foreground)."""
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if tile:
        d.rounded_rectangle((pad, pad, S - pad, S - pad), radius=210, fill=PURPLE)
    d.polygon([(190, 300), (500, 360), (500, 790), (190, 730)], fill=(255, 255, 255, 255))
    d.polygon([(834, 300), (524, 360), (524, 790), (834, 730)], fill=(232, 228, 255, 255))
    for y in (440, 520, 600):
        d.line([(250, y - 18), (440, y + 18)], fill=(160, 150, 225, 255), width=26)
    d.line([(580, 470), (775, 432)], fill=(255, 210, 74, 255), width=54)
    d.line([(590, 640), (650, 700), (770, 560)], fill=PURPLE, width=44, joint='curve')
    return im.resize((size, size), Image.LANCZOS)


def full_bleed(size):
    """Square, no transparency (iOS home screen and maskable icons crop it themselves)."""
    bg = Image.new('RGBA', (S, S), PURPLE)
    art = artwork(S, tile=False)
    shrunk = art.resize((int(S * 0.8), int(S * 0.8)), Image.LANCZOS)
    bg.alpha_composite(shrunk, ((S - shrunk.width) // 2, (S - shrunk.height) // 2))
    return bg.convert('RGB').resize((size, size), Image.LANCZOS)


def out(rel, im):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path)


# Desktop (Windows / macOS / Linux)
out('build/icon.png', artwork(1024))
artwork(256).save(os.path.join(ROOT, 'build/icon.ico'), sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
out('src/icon.png', artwork(256))
# Web app / iPad
out('web/icons/icon-192.png', artwork(192, pad=0))
out('web/icons/icon-512.png', artwork(512, pad=0))
out('web/icons/icon-maskable-512.png', full_bleed(512))
out('web/icons/apple-touch-icon.png', full_bleed(180))
# Android launcher icons (android/ must exist: npx cap add android)
if os.path.isdir(os.path.join(ROOT, 'android/app/src/main/res')):
    for name, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
        res = f'android/app/src/main/res/mipmap-{name}'
        out(f'{res}/ic_launcher.png', artwork(px, pad=0))
        out(f'{res}/ic_launcher_round.png', artwork(px, pad=0))
        # Adaptive icon foreground: 108dp canvas, artwork inside the central 66dp safe zone.
        fg_px = int(px * 108 / 48)
        canvas = Image.new('RGBA', (fg_px, fg_px), (0, 0, 0, 0))
        art = artwork(int(fg_px * 66 / 108), tile=False)
        canvas.alpha_composite(art, ((fg_px - art.width) // 2, (fg_px - art.height) // 2))
        out(f'{res}/ic_launcher_foreground.png', canvas)
    # Splash screens: the template's sizes, purple with the icon in the middle.
    import glob
    for path in glob.glob(os.path.join(ROOT, 'android/app/src/main/res/drawable*/splash.png')):
        w, h = Image.open(path).size
        bg = Image.new('RGBA', (w, h), PURPLE)
        art = artwork(int(min(w, h) * 0.38), tile=False)
        bg.alpha_composite(art, ((w - art.width) // 2, (h - art.height) // 2))
        bg.convert('RGB').save(path)
print('icons written')
