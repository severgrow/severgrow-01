# Like key.py but keeps the source framing (no crop/recentre), so layers from the same scene stay aligned.
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
src, dst, size, TH = sys.argv[1], sys.argv[2], int(sys.argv[3]), float(sys.argv[4])
a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
ratio = np.maximum(r, b) / np.maximum(g, 1)
k = np.clip((TH - ratio) / 0.12, 0, 1) * np.clip((g - 25) / 30, 0, 1)
alpha = 1 - k
alpha = nd.binary_opening(alpha > 0.5, iterations=2).astype(np.float32) * alpha
shadow = k * np.clip(1 - g / 235, 0, 1) * 0.85
alpha = nd.gaussian_filter(alpha, 0.7)
tot = alpha + shadow * (1 - alpha)
lim = np.maximum(r, b) * 1.05 + 30
g2 = np.where(alpha < 0.98, np.minimum(g, lim), g)
col = np.dstack([r, g2, b]) * (alpha / np.maximum(tot, 1e-6))[..., None]
Image.fromarray(np.dstack([col, tot * 255]).clip(0, 255).astype(np.uint8)).resize((size, size), Image.LANCZOS).save(dst, optimize=True)
