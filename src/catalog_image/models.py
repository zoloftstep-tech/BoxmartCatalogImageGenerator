from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Kind = Literal["assembled", "diecut"]


@dataclass(frozen=True)
class DimsMm:
    length: int  # Д
    width: int  # Ш
    height: int  # В
