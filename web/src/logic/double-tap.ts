export type TapPoint = {x:number;y:number;at:number};
/** Compare the input's own clock and position. Wall-clock changes or a busy event handler
 * cannot turn an already-queued quick gesture into a slow one. */
export const isDoubleTap = (previous:TapPoint|null,current:TapPoint,windowMs:number,slopPx:number):boolean =>
  previous!==null && current.at>=previous.at && current.at-previous.at<=windowMs &&
  Math.hypot(current.x-previous.x,current.y-previous.y)<=slopPx;
