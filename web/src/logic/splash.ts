// THE HOME-SCREEN LAUNCH SCREEN (owner, 2026-11-06: "I'm still seeing the white flash when opening",
// from the home-screen icon). iOS shows its own launch screen before the page loads, white unless the
// site names an `apple-touch-startup-image` for the exact screen. One plain charcoal image per device
// size and orientation (web/public/splash/), so the app opens straight into the game's dark.
// Device CSS size and pixel ratio; the image is width*dpr x height*dpr in portrait (swapped in landscape).
export const SPLASH_DEVICES: readonly { w: number; h: number; dpr: 2 | 3 }[] = Object.freeze([
  { w: 440, h: 956, dpr: 3 }, // iPhone 16/17 Pro Max
  { w: 402, h: 874, dpr: 3 }, // iPhone 16/17 Pro
  { w: 420, h: 912, dpr: 3 }, // iPhone Air
  { w: 430, h: 932, dpr: 3 }, // iPhone 14/15 Pro Max, 15/16 Plus
  { w: 393, h: 852, dpr: 3 }, // iPhone 14/15 Pro, 15/16, 16e/17
  { w: 428, h: 926, dpr: 3 }, // iPhone 12/13 Pro Max, 14 Plus
  { w: 390, h: 844, dpr: 3 }, // iPhone 12/13/14
  { w: 375, h: 812, dpr: 3 }, // iPhone X/XS/11 Pro, 12/13 mini
  { w: 414, h: 896, dpr: 3 }, // iPhone XS Max, 11 Pro Max
  { w: 414, h: 896, dpr: 2 }, // iPhone XR, 11
  { w: 414, h: 736, dpr: 3 }, // iPhone 8 Plus
  { w: 375, h: 667, dpr: 2 }, // iPhone 8, SE 2/3
  { w: 320, h: 568, dpr: 2 }, // iPhone SE 1
  { w: 1032, h: 1376, dpr: 2 }, // iPad Pro 13 (M4)
  { w: 1024, h: 1366, dpr: 2 }, // iPad Pro 12.9
  { w: 834, h: 1210, dpr: 2 }, // iPad Pro 11 (M4)
  { w: 834, h: 1194, dpr: 2 }, // iPad Pro 11
  { w: 820, h: 1180, dpr: 2 }, // iPad Air 10.9, iPad 10th
  { w: 768, h: 1024, dpr: 2 }, // iPad 9.7 / mini 5
  { w: 744, h: 1133, dpr: 2 }, // iPad mini 6/7
]);

export type SplashImage = { file: string; px: [number, number]; media: string };

export const splashImages = (): SplashImage[] =>
  SPLASH_DEVICES.flatMap(({ w, h, dpr }) => (['portrait', 'landscape'] as const).map((o) => {
    const px: [number, number] = o === 'portrait' ? [w * dpr, h * dpr] : [h * dpr, w * dpr];
    return {
      file: `splash/launch-${px[0]}x${px[1]}.png`,
      px,
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${o})`,
    };
  }));
