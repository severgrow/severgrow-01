# Splits a sheet of soft, semi-transparent sprites (smoke) on green into separate files:
# alpha from how much each pixel departs from the green, colour unmixed from the green,
# then one square canvas per blob (largest first).
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
src, outpat, size = sys.argv[1], sys.argv[2], int(sys.argv[3])
p = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
B = np.median(np.concatenate([p[:8].reshape(-1, 3), p[-8:].reshape(-1, 3)]), 0)
gex = p[..., 1] - np.maximum(p[..., 0], p[..., 2])
bex = B[1] - max(B[0], B[2])
a = np.clip(1 - gex / bex, 0, 1)
a = np.clip((a - 0.06) / 0.94, 0, 1)
F = (p - (1 - a[..., None]) * B) / np.maximum(a[..., None], 1e-3)
F = np.clip(F, 0, 255)
F[..., 1] = np.minimum(F[..., 1], (F[..., 0] + F[..., 2]) / 2 + 8)  # no green cast (grey and orange keep g <= avg(r, b))
lab, n = nd.label(nd.gaussian_filter(a, 6) > 0.04)
sizes = nd.sum(a, lab, range(1, n + 1))
for i, idx in enumerate(np.argsort(-sizes)[:3]):
    m = nd.binary_dilation(lab == idx + 1, iterations=4)
    ys, xs = np.nonzero(m & (a > 0.02))
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([F, a * 255 * m])[y0:y1, x0:x1].astype(np.uint8)
    side = int(max(y1 - y0, x1 - x0) * 1.08)
    c = np.zeros((side, side, 4), np.uint8)
    oy, ox = (side - (y1 - y0)) // 2, (side - (x1 - x0)) // 2
    c[oy:oy + y1 - y0, ox:ox + x1 - x0] = rgba
    Image.fromarray(c).resize((size, size), Image.LANCZOS).save(outpat % (i + 1), optimize=True)
    print('puff', i + 1, x1 - x0, 'x', y1 - y0)
