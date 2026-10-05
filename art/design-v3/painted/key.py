# Cuts a sprite off a pure-green (#00FF00) background: soft key on how far a pixel is from that
# green, green spill removed at the edges, cropped and centred on a square canvas.
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
src, dst, size = sys.argv[1], sys.argv[2], int(sys.argv[3])
# how "pure" a green must be to count as background (lower for leafy sprites with dark leaves)
TH = float(sys.argv[4]) if len(sys.argv) > 4 else 0.42
a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
# "keyness": strong pure green, little red and blue
# background = pure-hue green at any brightness (the painted shadow on the green is dark green):
# red and blue tiny next to green. Moss and leaves keep real red in them, so they stay.
ratio = np.maximum(r, b) / np.maximum(g, 1)
k = np.clip((TH - ratio) / 0.12, 0, 1) * np.clip((g - 25) / 30, 0, 1)
alpha = 1 - k
# the painted shadow becomes a soft black shadow: darker green = more shadow
shadow = k * np.clip(1 - g / 235, 0, 1) * 0.85
alpha = nd.binary_opening(alpha > 0.5, iterations=2).astype(np.float32) * alpha
lab, n = nd.label(alpha > 0.5)
if n:
    big = np.argmax(nd.sum(alpha > 0.5, lab, range(1, n + 1))) + 1
    keep = nd.binary_dilation(lab == big, iterations=3)
    alpha *= keep
alpha = nd.gaussian_filter(alpha, 0.7)
# despill: no pixel greener than its red/blue allow
lim = np.maximum(r, b) * 1.05 + 30
g2 = np.where(alpha < 0.98, np.minimum(g, lim), g)
sh = shadow * keep if n else shadow
tot = alpha + sh * (1 - alpha)
col = np.dstack([r, g2, b]) * (alpha / np.maximum(tot, 1e-6))[..., None]
out = np.dstack([col, tot * 255]).clip(0, 255).astype(np.uint8)
ys, xs = np.nonzero(tot > 0.05)
y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
crop = out[y0:y1, x0:x1]
side = int(max(y1 - y0, x1 - x0) / 0.86)
canvas = np.zeros((side, side, 4), np.uint8)
oy, ox = (side - (y1 - y0)) // 2, (side - (x1 - x0)) // 2
canvas[oy:oy + y1 - y0, ox:ox + x1 - x0] = crop
Image.fromarray(canvas).resize((size, size), Image.LANCZOS).save(dst, optimize=True)
