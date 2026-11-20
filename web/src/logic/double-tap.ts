export type TapPoint = {x:number;y:number;at:number};
/** How long two taps may be apart, RELEASE to RELEASE on the input's own clock, and still be ONE
 * double tap. It lives here, beside `isDoubleTap`, instead of inside `world-view.ts` so the gesture
 * suites can import the same number they assert against: a production change that narrows the
 * window must break those suites honestly, not leave them passing on a lucky run. */
export const DOUBLE_TAP_MS = 280;
/** Compare the input's own clock and position. Wall-clock changes or a busy event handler
 * cannot turn an already-queued quick gesture into a slow one. */
export const isDoubleTap = (previous:TapPoint|null,current:TapPoint,windowMs:number,slopPx:number):boolean =>
  previous!==null && current.at>=previous.at && current.at-previous.at<=windowMs &&
  Math.hypot(current.x-previous.x,current.y-previous.y)<=slopPx;
