from __future__ import annotations

from functools import lru_cache

from PIL import Image


@lru_cache(maxsize=1)
def _session():
    from rembg import new_session

    # u2net is a good default for solid products on busy backgrounds
    return new_session("u2net")


def remove_background(image: Image.Image) -> Image.Image:
    """Return RGBA cutout with transparent background."""
    from rembg import remove

    rgba = image.convert("RGBA")
    return remove(rgba, session=_session())
