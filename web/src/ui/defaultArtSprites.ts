// Static imports let Vite give each carefully cropped tile a content-hashed URL.
// The files are small and decoded once; no runtime canvas or art generation runs.
import meadow1 from '../assets/default-skin/01-meadow.webp?url';
import meadow2 from '../assets/default-skin/02-meadow.webp?url';
import meadow3 from '../assets/default-skin/03-meadow.webp?url';
import meadow4 from '../assets/default-skin/04-meadow.webp?url';
import meadow5 from '../assets/default-skin/05-meadow.webp?url';
import meadow6 from '../assets/default-skin/06-meadow.webp?url';
import meadow7 from '../assets/default-skin/07-meadow.webp?url';
import meadow8 from '../assets/default-skin/08-meadow.webp?url';
import meadow9 from '../assets/default-skin/09-meadow.webp?url';
import ashen1 from '../assets/default-skin/10-ashen.webp?url';
import ashen2 from '../assets/default-skin/11-ashen.webp?url';
import ashen3 from '../assets/default-skin/12-ashen.webp?url';
import ashen4 from '../assets/default-skin/13-ashen.webp?url';
import ashen5 from '../assets/default-skin/14-ashen.webp?url';
import ashen6 from '../assets/default-skin/15-ashen.webp?url';
import ashen7 from '../assets/default-skin/16-ashen.webp?url';
import ashen8 from '../assets/default-skin/17-ashen.webp?url';
import ashen9 from '../assets/default-skin/18-ashen.webp?url';
import garden from '../assets/default-skin/19-garden.webp?url';
import fortress from '../assets/default-skin/20-fortress.webp?url';

export const DEFAULT_ART_SPRITES = [
  meadow1, meadow2, meadow3, meadow4, meadow5, meadow6, meadow7, meadow8, meadow9,
  ashen1, ashen2, ashen3, ashen4, ashen5, ashen6, ashen7, ashen8, ashen9,
  garden, fortress,
] as const;
