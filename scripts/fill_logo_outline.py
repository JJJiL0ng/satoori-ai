"""Fill the area inside the outermost outline of logo.png with a solid color.

The source logo already has alpha=0 *outside* the map outline (transparent
background), and alpha>0 for the outline strokes themselves and any inner
content. The shape we want to flood-fill is "everything bounded by the
outermost opaque outline", which equals the outline pixels plus the
transparent holes that are *enclosed* by the outline.

Algorithm:
1. Load RGBA, build opaque mask (alpha > alpha_threshold).
2. Flood-fill the transparent region from the image borders — these are the
   pixels that are transparent AND reachable from outside without crossing
   the outline. They stay transparent in the output.
3. Everything else (opaque pixels + transparent holes inside the outline)
   gets painted in --color, alpha=255.
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image


def parse_hex_color(s: str) -> tuple[int, int, int]:
    s = s.lstrip("#")
    if len(s) == 3:
        s = "".join(ch * 2 for ch in s)
    if len(s) != 6:
        raise ValueError(f"invalid hex color: {s}")
    return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)


def fill_inside_outline(
    src_path: Path,
    dst_path: Path,
    fill_color: tuple[int, int, int],
    alpha_threshold: int = 8,
) -> None:
    img = Image.open(src_path).convert("RGBA")
    arr = np.array(img)
    h, w = arr.shape[:2]

    alpha = arr[..., 3]
    transparent = alpha <= alpha_threshold

    outside = np.zeros((h, w), dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    for x in range(w):
        for y in (0, h - 1):
            if transparent[y, x]:
                outside[y, x] = True
                queue.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if transparent[y, x] and not outside[y, x]:
                outside[y, x] = True
                queue.append((y, x))

    while queue:
        y, x = queue.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if (
                0 <= ny < h
                and 0 <= nx < w
                and not outside[ny, nx]
                and transparent[ny, nx]
            ):
                outside[ny, nx] = True
                queue.append((ny, nx))

    inside = ~outside

    out = np.zeros_like(arr)
    out[inside, 0] = fill_color[0]
    out[inside, 1] = fill_color[1]
    out[inside, 2] = fill_color[2]
    out[inside, 3] = 255

    Image.fromarray(out, mode="RGBA").save(dst_path)
    print(
        f"wrote {dst_path} — inside={inside.sum()} px filled, outside={outside.sum()} px transparent"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--src",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "logo.png",
    )
    parser.add_argument(
        "--dst",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "logo_filled.png",
    )
    parser.add_argument("--color", type=str, default="#000000", help="hex fill color")
    parser.add_argument(
        "--alpha-threshold",
        type=int,
        default=8,
        help="pixels with alpha <= this are considered transparent",
    )
    args = parser.parse_args()

    fill_inside_outline(
        args.src, args.dst, parse_hex_color(args.color), args.alpha_threshold
    )


if __name__ == "__main__":
    main()
