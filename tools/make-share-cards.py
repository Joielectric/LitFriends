#!/usr/bin/env python3
"""Rebuild the share cards for the hand-built pages in profiles/.

    python3 tools/make-share-cards.py          # rebuild, rename, repoint
    python3 tools/make-share-cards.py --check   # say what would change

The pages the Content Manager serves build their own cards in the browser
(js/share-card.js) and rebuild them whenever a creator saves. The nine pages in
profiles/ have no profile record behind them, so nothing rebuilds theirs —
hence this, run by hand when a portrait, name or tagline changes.

The layout follows js/share-card.js so the two sets read as one.

Two things worth knowing before changing anything here:

  * No site mark. A card for one of these creators is theirs; a shared link
    should arrive as them and not as the site they are hosted on. Their own
    icon would only repeat the avatar, so the corner is left empty.

  * The file name carries a hash of its own contents, and this script rewrites
    the og:image and twitter:image tags to match. That is not decoration.
    Facebook, X, Discord and Slack all cache a preview image against its URL,
    so a card replaced at the same path goes on showing the old picture for as
    long as they feel like it. A new path is a new image to every one of them.

Each page's own banner is a 1700x500 strip with the creator's name already
lettered across it, so it cannot be the backdrop — the name would appear twice.
Their portrait is used instead, blurred well past recognition, which keeps the
card in their colours without competing with the type.

Needs Pillow (`pip install pillow`) and fetches two Google fonts on first run,
cached under tools/.fonts.
"""
import argparse
import hashlib
import pathlib
import re
import subprocess
import sys
import urllib.request

try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
except ImportError:
    sys.exit("Pillow is needed: pip install pillow")

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / "tools" / ".fonts"

W, H = 1200, 630
MARGIN, AV, LOGO_W = 76, 286, 150

# Pinned by URL because Google serves a different file per family version; if
# one 404s, take the new URL from the css2 API for the same family and weight.
FONTS = {
    "Cinzel600.ttf":
        "https://fonts.gstatic.com/s/cinzel/v26/8vIU7ww63mVu7gtR-kwKxNvkNOjw-gjgTYo.ttf",
    "CormorantItalic.ttf":
        "https://fonts.gstatic.com/s/cormorantgaramond/v21/"
        "co3smX5slCNuHLi8bLeY9MK7whWMhyjYrGFEsdtdc62E6zd58jDOjw.ttf",
}

# slug, portrait, name, tagline, accent, light
#
# The accent is the page's own --accent, and `light` marks the one page with a
# pale background, whose card matches it rather than the rest of the site.
CREATORS = [
    ("filthy-bunny", "images/Filthy_Bunny_Avatar_GreenEyes.png", "Filthy Bunny",
     "Voice Artist · Writer · Switchy Sub", "#b03050", False),
    ("hisbadgirl77", "images/HBG_WIngs.png", "HisBadGirl77",
     "Voice Artist · Writer · Collaborator", "#c85a20", False),
    ("la-sphynxxx", "images/LS_ICON.png", "LaSphynxxx",
     "Voice Artist · Singer · Free Content · Open Requests", "#e0bc4a", False),
    ("loona-licks", "images/LL_Icon.png", "Loona Licks",
     "Voice Artist · Collaborator · Currently on Hiatus", "#c84060", False),
    ("lotus-kitty", "images/LK_Icon.png", "Lotus Kitty",
     "Voice Artist · Demisexual · Storyteller", "#c87ab8", False),
    ("misskittenSK", "images/MissKittenSKClub.png", "MissKittenSK",
     "A decade of debauched erotic audio · Retired", "#c8922a", False),
    ("naughtiwolf", "images/NW_Icon.png", "NaughtiWolf",
     "Voice Artist · BFE · Narrative Collaborator", "#c8843a", False),
    ("wellnobodysperfect", "images/WNP_Icon.png", "Well Nobody's Perfect",
     "Voice Artist · Funny · Delightfully Unpredictable", "#e8507a", True),
]


def font_path(name):
    FONT_DIR.mkdir(parents=True, exist_ok=True)
    p = FONT_DIR / name
    if not p.exists():
        print(f"  fetching {name}…")
        try:
            urllib.request.urlretrieve(FONTS[name], p)
        except Exception as err:
            sys.exit(f"could not fetch {name}: {err}")
    return str(p)


cinzel = lambda s: ImageFont.truetype(font_path("Cinzel600.ttf"), s)
corm_i = lambda s: ImageFont.truetype(font_path("CormorantItalic.ttf"), s)


def cover(img, w, h):
    """Scale to fill and crop the overflow — CSS background-size: cover."""
    r = img.width / img.height
    nw, nh = (round(h * r), h) if r > w / h else (w, round(w / r))
    img = img.resize((nw, nh), Image.LANCZOS)
    return img.crop(((nw - w) // 2, (nh - h) // 2, (nw - w) // 2 + w, (nh - h) // 2 + h))


def vgradient(w, h, top, bottom):
    g = Image.new("RGBA", (1, h))
    px = g.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(4))
    return g.resize((w, h))


def tracked(d, xy, text, font, fill, tracking):
    """Letter-spaced text: Pillow has no tracking, so step glyph by glyph."""
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + tracking


def tracked_w(d, text, font, tracking):
    return sum(d.textlength(c, font=font) for c in text) + tracking * max(len(text) - 1, 0)


def wrap(d, text, font, max_w, tracking=0):
    lines, cur = [], ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if tracked_w(d, trial, font, tracking) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def circle(img, size):
    """A round crop, masked at 4x so the edge is not stepped."""
    img = cover(img.convert("RGB"), size, size).convert("RGBA")
    m = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(m).ellipse((0, 0, m.width - 1, m.height - 1), fill=255)
    img.putalpha(m.resize((size, size), Image.LANCZOS))
    return img


def draw_card(portrait, name, tagline, accent, light):
    ar, ag, ab = (int(accent[i:i + 2], 16) for i in (1, 3, 5))
    src = Image.open(ROOT / portrait)

    base = cover(src.convert("RGB"), W, H).filter(ImageFilter.GaussianBlur(34)).convert("RGBA")
    base.alpha_composite(vgradient(W, H, (255, 250, 247, 170), (255, 245, 241, 214)) if light
                         else vgradient(W, H, (10, 9, 14, 150), (6, 5, 9, 238)))

    pool = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(pool).ellipse((120, 120, 1120, 980),
                                 fill=(255, 255, 255, 130) if light else (0, 0, 0, 140))
    base.alpha_composite(pool.filter(ImageFilter.GaussianBlur(120)))

    d = ImageDraw.Draw(base)

    ax, ay = MARGIN + 12, (H - AV) // 2
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((ax - 10, ay - 10, ax + AV + 10, ay + AV + 10), fill=(ar, ag, ab, 150))
    base.alpha_composite(glow.filter(ImageFilter.GaussianBlur(34)))
    base.alpha_composite(circle(src, AV), (ax, ay))
    d.ellipse((ax, ay, ax + AV, ay + AV), outline=(ar, ag, ab, 220), width=3)

    text_x = ax + AV + 62
    text_w = W - text_x - MARGIN
    ink = (26, 20, 24) if light else (238, 244, 255)
    soft = (72, 60, 68) if light else (214, 223, 240)

    y = 196
    tracked(d, (text_x, y), "EROTIC AUDIO", cinzel(20), (ar, ag, ab, 255), 6)
    y += 56

    # A long name steps down a size rather than wrapping into three cramped
    # lines; two is all the card has room for under the eyebrow.
    size, lines = 76, []
    while True:
        lines = wrap(d, name.upper(), cinzel(size), text_w, size * 0.09)
        if len(lines) <= 2 or size <= 38:
            break
        size -= 4
    for line in lines[:2]:
        tracked(d, (text_x, y), line, cinzel(size), ink + (255,), size * 0.09)
        y += size + 12

    y += 22
    d.rectangle((text_x, y, text_x + 84, y + 2), fill=(ar, ag, ab, 216))
    y += 30

    # A catchphrase reads best on one line, so step down looking for one before
    # accepting a wrap.
    size = 42
    while size > 26 and len(wrap(d, tagline, corm_i(size), text_w)) > 1:
        size -= 2
    lines = wrap(d, tagline, corm_i(size), text_w)
    if len(lines) > 1:
        size = 34
        lines = wrap(d, tagline, corm_i(size), text_w)
    for line in lines[:3]:
        d.text((text_x, y), line, font=corm_i(size), fill=soft + (255,))
        y += size + 12

    return base.convert("RGB")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true",
                    help="report what would change without writing anything")
    args = ap.parse_args()

    share = ROOT / "images" / "share"
    changed = []

    for slug, portrait, name, tagline, accent, light in CREATORS:
        img = draw_card(portrait, name, tagline, accent, light)

        tmp = share / f".{slug}.tmp.png"
        img.save(tmp, "PNG", optimize=True)
        digest = hashlib.sha256(tmp.read_bytes()).hexdigest()[:8]
        target = share / f"{slug}.{digest}.png"

        old = [p for p in share.glob(f"{slug}.*.png") if p != target]
        if target.exists() and not old:
            tmp.unlink()
            print(f"  {slug:<22} unchanged")
            continue

        if args.check:
            tmp.unlink()
            print(f"  {slug:<22} would become {target.name}")
            changed.append(slug)
            continue

        tmp.replace(target)
        for p in old:
            subprocess.run(["git", "rm", "-q", "--ignore-unmatch", str(p)], cwd=ROOT)
            p.unlink(missing_ok=True)

        page = ROOT / "profiles" / f"{slug}.html"
        s = page.read_text(encoding="utf-8")
        # Both og:image and twitter:image, absolute or not.
        s = re.sub(rf"/images/share/{re.escape(slug)}(?:\.[0-9a-f]{{8}})?\.png",
                   f"/images/share/{target.name}", s)
        page.write_text(s, encoding="utf-8")

        print(f"  {slug:<22} -> {target.name}")
        changed.append(slug)

    print(f"\n{len(changed)} card(s) {'would change' if args.check else 'rebuilt'}.")
    if changed and not args.check:
        print("Commit the new images together with the pages that point at them.")


if __name__ == "__main__":
    main()
