from __future__ import annotations

import math
from typing import Tuple

from PIL import Image, ImageDraw, ImageFont

from .models import DimsMm, Kind

Color = Tuple[int, int, int]
INK: Color = (34, 34, 34)


def _font(size: int) -> ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def _subject_bbox(image: Image.Image, bg_tol: int = 14) -> tuple[int, int, int, int]:
    rgba = image.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    br, bg, bb, _ = px[2, 2]
    xs: list[int] = []
    ys: list[int] = []
    step = max(1, min(w, h) // 500)
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            if abs(r - br) + abs(g - bg) + abs(b - bb) > bg_tol * 3:
                xs.append(x)
                ys.append(y)
    if not xs:
        return int(w * 0.18), int(h * 0.22), int(w * 0.82), int(h * 0.78)
    return min(xs), min(ys), max(xs), max(ys)


def _arrowhead(
    draw: ImageDraw.ImageDraw,
    tip: tuple[float, float],
    direction: tuple[float, float],
    size: float,
    color: Color = INK,
) -> None:
    dx, dy = direction
    length = math.hypot(dx, dy) or 1.0
    ux, uy = dx / length, dy / length
    # base center behind tip
    bx, by = tip[0] - ux * size, tip[1] - uy * size
    px, py = -uy, ux
    p1 = (tip[0], tip[1])
    p2 = (bx + px * size * 0.55, by + py * size * 0.55)
    p3 = (bx - px * size * 0.55, by - py * size * 0.55)
    draw.polygon([p1, p2, p3], fill=color)


def _dim_line(
    draw: ImageDraw.ImageDraw,
    *,
    start: tuple[float, float],
    end: tuple[float, float],
    label: str,
    font: ImageFont.ImageFont,
    canvas: tuple[int, int],
    label_side: str,
    color: Color = INK,
    stroke: int = 2,
    arrow: float = 11,
) -> None:
    x0, y0 = start
    x1, y1 = end
    draw.line([(x0, y0), (x1, y1)], fill=color, width=stroke)
    _arrowhead(draw, (x0, y0), (x0 - x1, y0 - y1), arrow, color)
    _arrowhead(draw, (x1, y1), (x1 - x0, y1 - y0), arrow, color)

    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    bbox = draw.textbbox((0, 0), label, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    gap = 10
    if label_side == "above":
        tx, ty = mx - tw / 2, my - th - gap
    elif label_side == "below":
        tx, ty = mx - tw / 2, my + gap
    elif label_side == "left":
        tx, ty = mx - tw - gap, my - th / 2
    else:
        tx, ty = mx + gap, my - th / 2

    cw, ch = canvas
    tx = max(4, min(tx, cw - tw - 4))
    ty = max(4, min(ty, ch - th - 4))
    draw.text((tx, ty), label, font=font, fill=color)


def _extension(
    draw: ImageDraw.ImageDraw,
    a: tuple[float, float],
    b: tuple[float, float],
    color: Color = INK,
    width: int = 1,
) -> None:
    draw.line([a, b], fill=color, width=width)


def draw_dimensions(image: Image.Image, dims: DimsMm, *, kind: Kind = "assembled") -> Image.Image:
    """Technical arrows + Д/Ш/В labels matching refs/style-*.png."""
    out = image.convert("RGBA").copy()
    draw = ImageDraw.Draw(out)
    cw, ch = out.size
    x0, y0, x1, y1 = _subject_bbox(out)
    font = _font(max(20, cw // 48))
    gap = max(34, cw // 38)
    tick = max(10, cw // 90)

    # Assembled: Д top, Ш right-top(depth), В left-height
    # Diecut: Ш left full height, Д bottom, В right flap height
    if kind == "assembled":
        # Length along top
        ly = y0 - gap
        _extension(draw, (x0, y0 - 4), (x0, ly - tick // 2))
        _extension(draw, (x1, y0 - 4), (x1, ly - tick // 2))
        _dim_line(
            draw,
            start=(x0, ly),
            end=(x1, ly),
            label=f"Д {dims.length} мм",
            font=font,
            canvas=(cw, ch),
            label_side="above",
        )
        # Width along right (approx depth of bbox)
        rx = x1 + gap
        _extension(draw, (x1 + 4, y0), (rx + tick // 2, y0))
        _extension(draw, (x1 + 4, y1), (rx + tick // 2, y1))
        _dim_line(
            draw,
            start=(rx, y0),
            end=(rx, y1),
            label=f"Ш {dims.width} мм",
            font=font,
            canvas=(cw, ch),
            label_side="right",
        )
        # Height short on left front
        lx = x0 - gap
        hy1 = y0 + max(36, int((y1 - y0) * 0.22))
        _extension(draw, (x0 - 4, y0), (lx - tick // 2, y0))
        _extension(draw, (x0 - 4, hy1), (lx - tick // 2, hy1))
        _dim_line(
            draw,
            start=(lx, y0),
            end=(lx, hy1),
            label=f"В {dims.height} мм",
            font=font,
            canvas=(cw, ch),
            label_side="left",
        )
    else:
        # Width full left
        lx = x0 - gap
        _extension(draw, (x0 - 4, y0), (lx - tick // 2, y0))
        _extension(draw, (x0 - 4, y1), (lx - tick // 2, y1))
        _dim_line(
            draw,
            start=(lx, y0),
            end=(lx, y1),
            label=f"Ш {dims.width} мм",
            font=font,
            canvas=(cw, ch),
            label_side="left",
        )
        # Length bottom
        by = y1 + gap
        _extension(draw, (x0, y1 + 4), (x0, by + tick // 2))
        _extension(draw, (x1, y1 + 4), (x1, by + tick // 2))
        _dim_line(
            draw,
            start=(x0, by),
            end=(x1, by),
            label=f"Д {dims.length} мм",
            font=font,
            canvas=(cw, ch),
            label_side="below",
        )
        # Height on right — upper flap band (~15% of height from top of subject)
        rx = x1 + gap
        hy0 = y0
        hy1 = y0 + max(28, int((y1 - y0) * 0.16))
        _extension(draw, (x1 + 4, hy0), (rx + tick // 2, hy0))
        _extension(draw, (x1 + 4, hy1), (rx + tick // 2, hy1))
        _dim_line(
            draw,
            start=(rx, hy0),
            end=(rx, hy1),
            label=f"В {dims.height} мм",
            font=font,
            canvas=(cw, ch),
            label_side="right",
        )

    return out


def draw_fefco_badge(image: Image.Image, code: str) -> Image.Image:
    out = image.convert("RGBA").copy()
    draw = ImageDraw.Draw(out)
    font = _font(max(22, out.size[0] // 40))
    text = f"FEFCO {code}"
    margin = max(20, out.size[0] // 45)
    draw.text((margin, margin), text, font=font, fill=INK)
    return out
