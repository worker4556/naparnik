from PIL import Image
from pathlib import Path

src = Path(r"D:\Cursor\hack avito\naparnik\frontend2\avito-logo-full.png")
out_dir = Path(r"D:\Cursor\hack avito\naparnik\frontend2")
img = Image.open(src).convert("RGBA")


def content_bbox(im: Image.Image, alpha_thr: int = 8):
    px = im.load()
    w, h = im.size
    min_x, min_y, max_x, max_y = w, h, 0, 0
    found = False
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > alpha_thr:
                found = True
                if x < min_x: min_x = x
                if y < min_y: min_y = y
                if x > max_x: max_x = x
                if y > max_y: max_y = y
    if not found:
        return (0, 0, w, h)
    pad = 4
    return (
        max(0, min_x - pad),
        max(0, min_y - pad),
        min(w, max_x + 1 + pad),
        min(h, max_y + 1 + pad),
    )


cropped = img.crop(content_bbox(img))
light_path = out_dir / "avito-logo.png"
cropped.save(light_path, optimize=True)

# Тёмная тема: чёрный wordmark → белый, цветные круги без изменений
dark = cropped.copy()
px = dark.load()
w, h = dark.size
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a > 0 and r < 40 and g < 40 and b < 40:
            px[x, y] = (255, 255, 255, a)
dark_path = out_dir / "avito-logo-dark.png"
dark.save(dark_path, optimize=True)

print("cropped", cropped.size)
print("light", light_path.stat().st_size)
print("dark", dark_path.stat().st_size)
