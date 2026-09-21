from __future__ import annotations

from PIL import Image, ImageDraw


def _parse_hex(color: str) -> tuple[int, int, int]:
    c = color.lstrip("#")
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
    return tuple(int(c[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def fit_on_canvas(
    cutout: Image.Image,
    *,
    size: int = 1600,
    bg: str = "#F5F5F5",
    padding: float = 0.12,
) -> Image.Image:
    """Center the cutout on a square canvas with padding."""
    cutout = cutout.convert("RGBA")
    bbox = cutout.getbbox()
    if bbox is None:
        canvas = Image.new("RGBA", (size, size), (*_parse_hex(bg), 255))
        return canvas

    subject = cutout.crop(bbox)
    max_side = int(size * (1.0 - 2 * padding))
    sw, sh = subject.size
    scale = min(max_side / sw, max_side / sh)
    new_w = max(1, int(sw * scale))
    new_h = max(1, int(sh * scale))
    subject = subject.resize((new_w, new_h), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (size, size), (*_parse_hex(bg), 255))
    x = (size - new_w) // 2
    y = (size - new_h) // 2
    canvas.alpha_composite(subject, (x, y))
    return canvas
