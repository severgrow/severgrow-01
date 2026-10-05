# Fits a keyed cluster (key.py / keygroup.py output) into a pointy-top hex's box: cropped tight, then
# scaled to the hex's width (sqrt(3)/2 of its height) and full height, centred on a square canvas
# whose side is the hex's corner-to-corner size, and trimmed to the hex.
import sys
from PIL import Image
src, dst, size = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src).convert('RGBA')
im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox())
h = round(size * 0.98)
w = round(h * 0.866)
c = Image.new('RGBA', (size, size))
c.alpha_composite(im.resize((w, h), Image.LANCZOS), ((size - w) // 2, (size - h) // 2))
# trimmed to the hex outline (soft edge drawn at 4x), so nothing spills onto the next tile
import math
from PIL import ImageDraw, ImageChops
k, R = 4, h / 2
m = Image.new('L', (size * k, size * k))
pts = [((size / 2 + R * math.cos(math.radians(60 * i - 30))) * k, (size / 2 + R * math.sin(math.radians(60 * i - 30))) * k) for i in range(6)]
ImageDraw.Draw(m).polygon(pts, fill=255)
m = m.resize((size, size), Image.LANCZOS)
c.putalpha(ImageChops.multiply(c.getchannel('A'), m))
c.save(dst, quality=88, method=6)
