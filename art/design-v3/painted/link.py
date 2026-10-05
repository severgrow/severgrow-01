# A painted link (a whole vine or lava channel on pure green) -> a tight, keyed strip at a given
# width; the strip is drawn once per link, stretched from one tile's edge to the other's.
import sys, subprocess
from PIL import Image
src, dst, width, th, tmp = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4], sys.argv[5]
subprocess.run([sys.executable, 'keygroup.py', src, tmp, '2048', th], check=True)
im = Image.open(tmp).convert('RGBA')
im = im.crop(im.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox())
im.resize((width, max(2, round(im.height * width / im.width))), Image.LANCZOS).save(dst, quality=86, method=6)
