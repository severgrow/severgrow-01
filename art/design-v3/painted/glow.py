# The molten glow alone, from a keyed crater sprite (for the home's pulse layer).
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
a = np.asarray(Image.open(sys.argv[1]).convert('RGBA')).astype(np.float32)
r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
hot = np.clip((r - 170) / 60, 0, 1) * np.clip((g - 70) / 80, 0, 1) * np.clip((r - b - 90) / 60, 0, 1)
hot = nd.gaussian_filter(hot, 1.2) * (al / 255)
Image.fromarray(np.dstack([r, g, b, hot * 255]).clip(0, 255).astype(np.uint8)).save(sys.argv[2], optimize=True)
