# Makes a painted texture tile: blends it with a half-offset copy of itself (the copy's edges join
# perfectly), so the seam disappears; then exports the hi (2048) and lo (1024) tiers as WebP.
import sys, numpy as np
from PIL import Image
src, name, out = sys.argv[1], sys.argv[2], sys.argv[3]
tone = sys.argv[4] if len(sys.argv) > 4 else ''
a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
h, w = a.shape[:2]
r = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
def ramp(n):
    t = np.abs(np.arange(n) - (n - 1) / 2) / ((n - 1) / 2)  # 0 centre .. 1 edge
    t = np.clip((t - 0.55) / 0.4, 0, 1)
    return 1 - t * t * (3 - 2 * t)                       # 1 centre, 0 near edges
wgt = np.outer(ramp(h), ramp(w))[..., None]
o = a * wgt + r * (1 - wgt)
if tone == 'quiet':
    g = o.mean(-1, keepdims=True)
    o = (g + (o - g) * 0.8) * 0.82
if tone == 'calm':  # quieter, darker, less saturated (gold must stay below owned ground)
    g = o.mean(-1, keepdims=True)
    o = (g + (o - g) * 0.7) * 0.72
o = Image.fromarray(o.clip(0, 255).astype(np.uint8))
for tier, size in (('hi', 2048), ('lo', 1024)):
    o.resize((size, size), Image.LANCZOS).save(f'{out}/{tier}_{name}.webp', quality=88, method=6)
b = np.asarray(o.resize((400, 400), Image.LANCZOS))
Image.fromarray(np.tile(b, (3, 3, 1))).save(f'{out}/proof_{name}.jpg', quality=85)
x = np.asarray(o).astype(float)
print(name, 'seam L/R', round(abs(x[:, 0] - x[:, -1]).mean(), 1), 'T/B', round(abs(x[0] - x[-1]).mean(), 1))
