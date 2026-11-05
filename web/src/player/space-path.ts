/** A small, periodic drift variation. Both the compositor and handoff read this same path. */
export function spacePath(t: number): { x: number; y: number } {
  const points = [[0,0],[.22,.29],[.5,.5],[.78,.71],[1,1]] as const;
  const at = Math.max(0,Math.min(1,t))*4, i = Math.min(3,Math.floor(at)), f = at-i;
  return { x: points[i]![0]+(points[i+1]![0]-points[i]![0])*f,
    y: points[i]![1]+(points[i+1]![1]-points[i]![1])*f };
}
