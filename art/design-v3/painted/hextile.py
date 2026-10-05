# A painted hex tile on pure green -> a clean pointy-top hex: the green found strictly (the grass is
# green too, so no soft key), the tile turned upright when painted flat-top, its bounding box fitted
# a little past the hex so the ragged fringe falls outside, then trimmed to the hex (soft edge at 4x).
import sys, math, numpy as np
from PIL import Image, ImageDraw, ImageChops
src, dst, size = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(int)
bg = (a[..., 1] > 200) & (a[..., 0] < 70) & (a[..., 2] < 70)
ys, xs = np.nonzero(~bg)
box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
im = im.crop(box)
if im.width > im.height:          # painted flat-top: a quarter turn makes it pointy-top
    im = im.transpose(Image.ROTATE_90)
over = 1.05                       # the fringe beyond the body is cut away
h = round(size * over)
w = round(size * 0.866 * over)
c = Image.new('RGBA', (size, size))
c.paste(im.resize((w, h), Image.LANCZOS), ((size - w) // 2, (size - h) // 2))
k, R = 4, size / 2
r = R * 0.985                     # a hair inside, so no green edge pixel survives
m = Image.new('L', (size * k, size * k))
ImageDraw.Draw(m).polygon([((R + r * math.cos(math.radians(60 * i - 30))) * k, (R + r * math.sin(math.radians(60 * i - 30))) * k) for i in range(6)], fill=255)
c.putalpha(m.resize((size, size), Image.LANCZOS))
c.save(dst, quality=88, method=6)
