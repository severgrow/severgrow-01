# Generated light sprites for the home: a soft warm glow (radial) and a firefly (bright core, halo).
import sys, numpy as np
from PIL import Image
out, size = sys.argv[1], int(sys.argv[2])
y, x = np.mgrid[0:size, 0:size] / (size - 1) * 2 - 1
r = np.hypot(x, y)
def save(name, rgb, a):
    Image.fromarray(np.dstack([np.broadcast_to(np.array(rgb, np.float32), (size, size, 3)), a * 255]).clip(0, 255).astype(np.uint8)).save(f'{out}/{name}.webp', quality=90)
save('home_glow', (255, 244, 190), np.clip(1 - r, 0, 1) ** 2.2 * 0.9)
save('firefly', (240, 255, 170), np.clip(1 - r / 0.22, 0, 1) + np.clip(1 - r, 0, 1) ** 3 * 0.55)
