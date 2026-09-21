from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from .compose import fit_on_canvas
from .models import DimsMm, Kind
from .overlay import draw_dimensions, draw_fefco_badge


@dataclass(frozen=True)
class ProcessOptions:
    dims: DimsMm
    kind: Kind = "assembled"
    bg: str = "#F5F5F5"
    canvas: int = 1600
    padding: float = 0.18
    fefco: str | None = None
    draw_dims: bool = True
    # If True: recenter onto square canvas (for inconsistent AI crops).
    # If False: annotate in-place (preferred for finished catalog plates).
    refit: bool = False


def _parse_hex(color: str) -> tuple[int, int, int]:
    c = color.lstrip("#")
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
    return tuple(int(c[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def ensure_margin(image: Image.Image, *, margin_ratio: float = 0.14, bg: str = "#F5F5F5") -> Image.Image:
    """Pad image so dimension arrows have room at the edges."""
    img = image.convert("RGBA")
    w, h = img.size
    pad = int(max(w, h) * margin_ratio)
    canvas = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (*_parse_hex(bg), 255))
    canvas.alpha_composite(img, (pad, pad))
    return canvas


def annotate_image(source: Path | Image.Image, options: ProcessOptions) -> Image.Image:
    """Draw Д/Ш/В arrows on an already-clean catalog photo (no bg removal)."""
    image = source if isinstance(source, Image.Image) else Image.open(source).convert("RGBA")
    if options.refit:
        composed = fit_on_canvas(
            image,
            size=options.canvas,
            bg=options.bg,
            padding=options.padding,
        )
    else:
        composed = ensure_margin(image, margin_ratio=0.12, bg=options.bg)
    if options.draw_dims:
        composed = draw_dimensions(composed, options.dims, kind=options.kind)
    if options.fefco:
        composed = draw_fefco_badge(composed, options.fefco)
    return composed


# Back-compat alias used by older CLI/UI paths
def process_image(source: Path | Image.Image, options: ProcessOptions) -> Image.Image:
    return annotate_image(source, options)


def process_and_save(
    source: Path,
    output: Path,
    options: ProcessOptions,
    *,
    format: str = "PNG",
) -> Path:
    result = annotate_image(source, options)
    output.parent.mkdir(parents=True, exist_ok=True)
    save_kwargs: dict = {}
    fmt = format.upper()
    if fmt == "JPEG":
        result = result.convert("RGB")
        save_kwargs["quality"] = 92
        save_kwargs["optimize"] = True
    elif fmt == "WEBP":
        save_kwargs["quality"] = 90
        save_kwargs["method"] = 6
    result.save(output, format=fmt, **save_kwargs)
    return output
