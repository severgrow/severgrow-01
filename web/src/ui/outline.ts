type Point=readonly[number,number];
/** Weld shared projected endpoints before walking them. Pixel-snapped centre vectors can put
 * the two drawn versions of one corner a fraction of a device pixel apart. This only joins
 * the decorative silhouette; it never moves tile art or changes hit geometry. */
export function outlinePath(edges:readonly(readonly[Point,Point])[],tolerance=.15):string {
  const points:{x:number;y:number;count:number}[]=[];
  const vertex=(p:Point)=>{
    const found=points.findIndex(v=>Math.hypot(v.x/v.count-p[0],v.y/v.count-p[1])<=tolerance);
    if(found<0){points.push({x:p[0],y:p[1],count:1});return points.length-1;}
    const v=points[found]!;v.x+=p[0];v.y+=p[1];v.count++;return found;
  };
  const remaining=new Map(edges.map(([a,b])=>[vertex(a),vertex(b)]));
  const fixed=(n:number)=>(Math.round(n*10)/10).toFixed(1);
  const at=(i:number)=>{const p=points[i]!;return `${fixed(p.x/p.count)},${fixed(p.y/p.count)}`;};
  let path='';
  while(remaining.size){
    const start=remaining.keys().next().value!;let point=start;
    path+=`M${at(start)}`;
    do{
      const next=remaining.get(point);remaining.delete(point);
      if(next===undefined)break;
      point=next;
      if(point!==start)path+=`L${at(point)}`;
    }while(point!==start&&remaining.has(point));
    if(point===start)path+='Z';
  }
  return path;
}
