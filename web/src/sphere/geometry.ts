// A frequency-10 icosahedron and its geodesic dual. No game state, storage or network.
export type V3 = readonly [number, number, number];
export const add=(a:V3,b:V3):V3=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const sub=(a:V3,b:V3):V3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const scale=(a:V3,n:number):V3=>[a[0]*n,a[1]*n,a[2]*n];
export const dot=(a:V3,b:V3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const unit=(p:V3):V3=>scale(p,1/(Math.hypot(...p)||1));
export type SphereCell={index:number;id:string;centre:V3;corners:number[];neighbours:number[]};
export type Sphere={cells:SphereCell[];corners:V3[];edges:readonly [number,number,number,number][]};

export const buildSphere=():Sphere=>{
  const phi=(1+Math.sqrt(5))/2;
  const ico:V3[]=[[-1,phi,0],[1,phi,0],[-1,-phi,0],[1,-phi,0],[0,-1,phi],[0,1,phi],
    [0,-1,-phi],[0,1,-phi],[phi,0,-1],[phi,0,1],[-phi,0,-1],[-phi,0,1]];
  for(let i=0;i<ico.length;i++)ico[i]=unit(ico[i]!);
  const faces=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],
    [10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  const points:V3[]=[], keys:string[]=[],ids=new Map<string,number>(), triangles:number[][]=[];
  const vertex=(p:V3,key:string)=>{
    const v=unit(p);
    let id=ids.get(key);if(id!==undefined)return id;
    id=points.length;ids.set(key,id);points.push(v);keys.push(key);return id;
  };
  for(const f of faces){
    const a=ico[f[0]!]!,b=ico[f[1]!]!,c=ico[f[2]!]!;
    const grid=new Map<string,number>();
    for(let i=0;i<=10;i++)for(let j=0;j<=10-i;j++){
      const weights=[10-i-j,i,j];
      // Exact integer barycentric identity, shared across either side of an icosahedral edge.
      // Stable ids do not depend on traversal order or floating-point coordinate rounding.
      const key=f.map((id,k)=>({id,w:weights[k]!})).filter(v=>v.w>0).sort((a,b)=>a.id-b.id)
        .map(v=>`${v.id}:${v.w}`).join('|');
      grid.set(`${i},${j}`,vertex(add(add(scale(a,10-i-j),scale(b,i)),scale(c,j)),key));
    }
    const at=(i:number,j:number)=>grid.get(`${i},${j}`)!;
    for(let i=0;i<10;i++)for(let j=0;j<10-i;j++){
      triangles.push([at(i,j),at(i+1,j),at(i,j+1)]);
      if(i+j<9)triangles.push([at(i+1,j),at(i+1,j+1),at(i,j+1)]);
    }
  }
  const corners:V3[]=[], incident=points.map(()=>[] as number[]),adjacent=points.map(()=>new Set<number>());
  triangles.forEach((t,id)=>{
    const a=points[t[0]!]!,b=points[t[1]!]!,c=points[t[2]!]!;
    let n=unit(cross(sub(b,a),sub(c,a)));
    if(dot(n,a)<0)n=scale(n,-1);
    corners.push(n);
    for(let i=0;i<3;i++){
      incident[t[i]!]!.push(id);
      adjacent[t[i]!]!.add(t[(i+1)%3]!);adjacent[t[i]!]!.add(t[(i+2)%3]!);
    }
  });
  const cells=points.map((centre,index):SphereCell=>{
    const tangent=unit(cross(Math.abs(centre[1])<.9?[0,1,0]:[1,0,0],centre)),bitangent=cross(centre,tangent);
    const around=incident[index]!.sort((a,b)=>Math.atan2(dot(corners[a]!,bitangent),dot(corners[a]!,tangent))
      -Math.atan2(dot(corners[b]!,bitangent),dot(corners[b]!,tangent)));
    return {index,id:`s10-${keys[index]!}`,centre,corners:around,neighbours:[...adjacent[index]!].sort((a,b)=>a-b)};
  });
  const shared=new Map<string,[number,number,number,number]>();
  for(const cell of cells)for(let i=0;i<cell.corners.length;i++){
    const a=cell.corners[i]!,b=cell.corners[(i+1)%cell.corners.length]!,key=[a,b].sort((x,y)=>x-y).join(':');
    const edge=shared.get(key);
    if(edge)edge[3]=cell.index;else shared.set(key,[a,b,cell.index,-1]);
  }
  return {cells,corners,edges:[...shared.values()]};
};

/** Closest real fan triangle, not a nearest centre on an ideal sphere. The mesh is closed and
 * opaque, so the closest hit hides every back-facing cell and remains exact at the horizon. */
export const pickCell=(sphere:Sphere,origin:V3,direction:V3):number|null=>{
  const b=dot(origin,direction),c=dot(origin,origin)-1;
  if(b*b-c<0 || b>0)return null;
  let distance=Infinity,selected:number|null=null;
  for(const cell of sphere.cells)for(let i=0;i<cell.corners.length;i++){
    const a=cell.centre,p=sphere.corners[cell.corners[i]!]!,q=sphere.corners[cell.corners[(i+1)%cell.corners.length]!]!;
    const e1=sub(p,a),e2=sub(q,a),h=cross(direction,e2),det=dot(e1,h);
    if(det<1e-10)continue; // outward winding, front hits only
    const s=sub(origin,a),u=dot(s,h)/det;if(u < -1e-9 || u>1+1e-9)continue;
    const crossS=cross(s,e1),v=dot(direction,crossS)/det;if(v < -1e-9 || u+v>1+1e-9)continue;
    const t=dot(e2,crossS)/det;
    if(t>0&&t<distance){distance=t;selected=cell.index;}
  }
  return selected;
};
