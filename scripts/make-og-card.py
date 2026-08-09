#!/usr/bin/env python3
"""Compose the social preview card.

Run when the headshot or the headline changes:

    python3 scripts/make-og-card.py

Not part of `npm run build`: it needs Pillow and macOS system fonts, and the
output changes about once a year. The PNG is committed.

Why it exists: every share of butkeraites.com on LinkedIn, Slack or WhatsApp
was rendering as a text-only tile, because the page declared `twitter:card:
summary` and no `og:image`. Sharing is how a portfolio reaches a recruiter, so
the one artifact that travels was the one missing.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "content" / "assets"
OUT = ASSETS / "og-card.png"

W, H = 1200, 630

# The site's dark palette, so a shared card and the page it opens look related.
BG = (16, 22, 26)
INK = (233, 238, 240)
INK_SOFT = (166, 180, 185)
ACCENT = (124, 198, 216)

F = "/System/Library/Fonts/Supplemental/"


def font(path, size):
    return ImageFont.truetype(path, size)


serif_bold = font(F + "Georgia Bold.ttf", 62)
serif = font(F + "Georgia.ttf", 30)
mono = font("/System/Library/Fonts/Monaco.ttf", 19)
sans = font(F + "Arial.ttf", 25)


def circular(img: Image.Image, size: int) -> Image.Image:
    """Square image -> antialiased circle, via a 4x supersampled mask."""
    img = img.convert("RGB").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * 4, size * 4), fill=255)
    img.putalpha(mask.resize((size, size), Image.LANCZOS))
    return img


def main() -> None:
    card = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(card)

    # A soft teal wash behind the portrait, so the right side is not a void.
    glow = Image.new("RGB", (W, H), BG)
    ImageDraw.Draw(glow).ellipse((760, 40, 1240, 520), fill=(22, 48, 58))
    card.paste(glow.filter(ImageFilter.GaussianBlur(90)), (0, 0))
    draw = ImageDraw.Draw(card)

    # --- portrait -------------------------------------------------------
    src = Image.open(ASSETS / "headshot-640.jpg")
    D = 372
    ring = 5
    cx, cy = 940, 315
    draw.ellipse(
        (cx - D // 2 - ring, cy - D // 2 - ring, cx + D // 2 + ring, cy + D // 2 + ring),
        fill=ACCENT,
    )
    portrait = circular(src, D)
    card.paste(portrait, (cx - D // 2, cy - D // 2), portrait)

    # --- text -----------------------------------------------------------
    x = 82
    draw.text((x, 150), "OPTIMIZATION  ·  OPERATIONS RESEARCH", font=mono, fill=ACCENT)

    draw.text((x, 196), "Renan", font=serif_bold, fill=INK)
    draw.text((x, 262), "Butkeraites", font=serif_bold, fill=INK)

    draw.text((x, 356), "PhD in Operations Research.", font=serif, fill=INK)
    draw.text(
        (x, 400),
        "I build the solvers behind the decisions —",
        font=sans,
        fill=INK_SOFT,
    )
    draw.text((x, 434), "and you can run four of them on the site.", font=sans, fill=INK_SOFT)

    draw.line((x, 496, x + 92, 496), fill=ACCENT, width=3)
    draw.text((x, 516), "butkeraites.com", font=mono, fill=INK_SOFT)

    card.save(OUT, "PNG", optimize=True)
    print(f"{OUT.relative_to(ROOT)}  {W}x{H}  {OUT.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
