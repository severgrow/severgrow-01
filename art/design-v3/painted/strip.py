# A network strip from a long painted band on green: cut out, cropped to the band's height, made to
# repeat seamlessly left-to-right (cross-fade of the two ends), then sized to the tiers (512x64, 256x32).
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
src, out, TH = sys.argv[1], sys.argv[2], float(sys.argv[3])
a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
k = np.clip((TH - np.maximum(r, b) / np.maximum(g, 1)) / 0.12, 0, 1) * np.clip((g - 25) / 30, 0, 1)
al = nd.gaussian_filter(1 - k, 0.7)
g2 = np.where(al < 0.98, np.minimum(g, np.maximum(r, b) * 1.05 + 30), g)
rgba = np.dstack([r, g2, b, al * 255])
rows = np.nonzero((al > 0.5).mean(1) > 0.08)[0]
y0, y1 = rows.min(), rows.max() + 1
band = rgba[y0:y1]
h, w = band.shape[:2]
o = w // 6  # overlap: the last sixth fades into the first
t = np.linspace(0, 1, o)[None, :, None]
head = band[:, :o] * t + band[:, w - o:] * (1 - t)
loop = np.concatenate([head, band[:, o:w - o]], 1)
im = Image.fromarray(loop.clip(0, 255).astype(np.uint8))
for name, (W, H) in (('hi', (512, 64)), ('lo', (256, 32))):
    im.resize((W, H), Image.LANCZOS).save(f'{out}_{name}.png', optimize=True)
print(src.split('/')[-1], 'band rows', y0, y1, 'loop width', loop.shape[1])
