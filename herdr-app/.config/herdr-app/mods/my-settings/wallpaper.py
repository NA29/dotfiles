"""Wallpaper helper for the my-settings panel.

  wallpaper.py thumbs <folder> <thumbs-dir>   small previews of every image in <folder>
                                              (made once, kept), as JSON:
                                              [{"src": abs path, "thumb": abs path, "name": file}]
  wallpaper.py use <image> <backgrounds-dir>  a copy Herdr can show (layout images must live
                                              in ~/.config/herdr-app): at most 2880px wide,
                                              with light edge strips trimmed (some wallpaper
                                              sites add them). Prints the copy's abs path.

Uses Pillow when it's there, else macOS sips (no trimming then).
"""
import hashlib
import json
import os
import subprocess
import sys

EXTS = (".jpg", ".jpeg", ".png", ".webp", ".heic", ".tif", ".tiff", ".bmp", ".gif")

try:
    from PIL import Image
except Exception:  # Pillow missing: sips does the resizing
    Image = None


def key(path):
    st = os.stat(path)
    return hashlib.sha1(f"{path}:{st.st_size}:{st.st_mtime}".encode()).hexdigest()[:12]


def sips(src, dst, size):
    subprocess.run(["sips", "-s", "format", "jpeg", "-Z", str(size), src, "--out", dst],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)


def thumbs(folder, out):
    os.makedirs(out, exist_ok=True)
    items = []
    for name in sorted(os.listdir(folder), key=str.lower):
        src = os.path.join(folder, name)
        if not name.lower().endswith(EXTS) or not os.path.isfile(src):
            continue
        dst = os.path.join(out, key(src) + "-169.jpg")
        if not os.path.exists(dst):
            try:
                if Image:  # centre-cropped to 16:9, so the grid's tiles never stretch
                    im = Image.open(src).convert("RGB")
                    w, h = im.size
                    tw, th = (w, round(w * 9 / 16)) if w * 9 <= h * 16 else (round(h * 16 / 9), h)
                    im = im.crop(((w - tw) // 2, (h - th) // 2, (w - tw) // 2 + tw, (h - th) // 2 + th))
                    im.resize((384, 216), Image.LANCZOS).save(dst, quality=85)
                else:
                    sips(src, dst, 384)
            except Exception:
                continue
        items.append({"src": src, "thumb": dst, "name": name})
    print(json.dumps(items))


def trim(im):
    """Crop strips of near-white along the edges (at most 3% per side)."""
    w, h = im.size
    px = im.convert("L").resize((w // 4 or 1, h // 4 or 1)).load()
    sw, sh = max(1, w // 4), max(1, h // 4)

    def bright_col(x):
        return sum(px[x, y] for y in range(sh)) / sh > 200

    def bright_row(y):
        return sum(px[x, y] for x in range(sw)) / sw > 200

    lim_x, lim_y = max(1, int(sw * 0.03)), max(1, int(sh * 0.03))
    left = next((x for x in range(lim_x) if not bright_col(x)), 0)
    right = next((k for k in range(lim_x) if not bright_col(sw - 1 - k)), 0)
    top = next((y for y in range(lim_y) if not bright_row(y)), 0)
    bottom = next((k for k in range(lim_y) if not bright_row(sh - 1 - k)), 0)
    if not (left or right or top or bottom):
        return im
    pad = lambda n: (n * 4 + 3) if n else 0  # back to full size, plus the soft transition
    return im.crop((pad(left), pad(top), w - pad(right), h - pad(bottom)))


def use(src, out):
    os.makedirs(out, exist_ok=True)
    base = os.path.splitext(os.path.basename(src))[0]
    slug = "".join(c if c.isalnum() or c in "-_" else "-" for c in base).strip("-")[:40] or "wallpaper"
    dst = os.path.join(out, f"{slug}-{key(src)[:6]}.jpg")
    if not os.path.exists(dst):
        if Image:
            im = trim(Image.open(src).convert("RGB"))
            if im.width > 2880:
                im = im.resize((2880, round(im.height * 2880 / im.width)), Image.LANCZOS)
            im.save(dst, quality=90)
        else:
            sips(src, dst, 2880)
    print(dst)


if __name__ == "__main__":
    mode, a, b = sys.argv[1:4]
    (thumbs if mode == "thumbs" else use)(os.path.expanduser(a), os.path.expanduser(b))
