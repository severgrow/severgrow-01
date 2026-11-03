import {type Sphere,type V3} from './geometry.js';
import type {Quat} from './rotation.js';
import {colourRgb,MOCK_PLAYERS} from './ownership.js';

export const EYE=3.6;
export const focal=(aspect:number,zoom:number)=>.82*Math.sqrt(EYE*EYE-1)*Math.min(1,aspect)*zoom;
const VERTEX=`
attribute vec3 aPosition; attribute vec3 aColour; attribute float aCell;
uniform vec4 uRotation; uniform float uAspect; uniform float uFocal;
varying vec3 vPosition; varying vec3 vColour; varying float vCell;
void main(){
 vec3 t=2.0*cross(uRotation.xyz,aPosition);
 vec3 p=aPosition+uRotation.w*t+cross(uRotation.xyz,t);
 float z=p.z-3.6;
 gl_Position=vec4(p.x*uFocal/uAspect,p.y*uFocal,-1.01005*z-.201005,-z);
 vPosition=p;vColour=aColour;vCell=aCell;
}`;
const FRAGMENT=`
precision highp float;
varying vec3 vPosition; varying vec3 vColour; varying float vCell;
uniform float uSelected; uniform float uPulse; uniform float uLine;
void main(){
 vec3 n=normalize(vPosition),eye=normalize(vec3(0.0,0.0,3.6)-vPosition);
 float facing=dot(n,eye);
 if(uLine>.5){
   if(facing<=.005)discard;
   gl_FragColor=vec4(vColour,uLine>1.5?.72+.22*uPulse:.4);return;
 }
 float light=max(0.0,dot(n,normalize(vec3(-.45,.65,1.2))));
 vec3 colour=vColour*(.38+.62*light);
 float edge=1.0-max(0.0,facing),rim=edge*edge*edge;
 colour+=vec3(.026,.031,.026)*rim;
 if(abs(vCell-uSelected)<.25)colour=mix(colour,vec3(.91,.87,.75),.12+.1*uPulse);
 gl_FragColor=vec4(colour,1.0);
}`;

/** One small indexed mesh, one shared-edge pass, one selected outline. No textures, postprocess,
 * dependency or idle loop. CPU picking uses these same fan triangles. */
export class SphereRenderer {
  readonly gl:WebGLRenderingContext;
  readonly bytes:number;
  private program:WebGLProgram;
  private buffers:WebGLBuffer[]=[];
  private face:WebGLBuffer;private edges:WebGLBuffer;private selected:WebGLBuffer;private indices:WebGLBuffer;
  private count:number;private edgeCount:number;private selectionCount=0;private selectedId=-1;
  private attrs:number[];
  private uniforms:Record<string,WebGLUniformLocation|null>={};
  frames=0;disposed=false;
  constructor(readonly canvas:HTMLCanvasElement,readonly sphere:Sphere,owners:Int8Array){
    const gl=canvas.getContext('webgl',{alpha:true,antialias:true,powerPreference:'low-power'});
    if(!gl)throw Error('WebGL unavailable');
    this.gl=gl;
    const shader=(kind:number,source:string)=>{
      const s=gl.createShader(kind);if(!s)throw Error('Graphics context unavailable');
      gl.shaderSource(s,source);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){gl.deleteShader(s);throw Error('Graphics shader unavailable');}return s;
    };
    const vs=shader(gl.VERTEX_SHADER,VERTEX),fs=shader(gl.FRAGMENT_SHADER,FRAGMENT),program=gl.createProgram();
    if(!program)throw Error('Graphics context unavailable');
    gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){gl.deleteProgram(program);throw Error('Graphics program unavailable');}
    this.program=program;
    this.attrs=['aPosition','aColour','aCell'].map(n=>gl.getAttribLocation(program,n));
    for(const name of ['uRotation','uAspect','uFocal','uSelected','uPulse','uLine'])this.uniforms[name]=gl.getUniformLocation(program,name);
    const faces:number[]=[],triangles:number[]=[],edges:number[]=[];
    const colours=MOCK_PLAYERS.map(p=>colourRgb(p.colour.css));
    const write=(out:number[],p:V3,c:V3,id:number)=>out.push(...p,...c,id);
    for(const cell of sphere.cells){
      const owner=owners[cell.index]!,colour=owner>=0?colours[owner]!:(owner===-2?[.074,.087,.079]:[.17,.19,.17]) as V3;
      const shade=.985+.025*Math.sin(cell.index*1.73),ink=colour.map(x=>x*shade) as unknown as V3;
      const start=faces.length/7;write(faces,cell.centre,ink,cell.index);
      for(const id of cell.corners)write(faces,sphere.corners[id]!,ink,cell.index);
      for(let i=0;i<cell.corners.length;i++)triangles.push(start,start+1+i,start+1+(i+1)%cell.corners.length);
    }
    for(const [a,b,left,right] of sphere.edges){
      const same=owners[left]===owners[right],occupied=owners[left]!>=0 || owners[right]!>=0;
      const colour:V3=same?(occupied?[.17,.2,.18]:[.31,.35,.31]):[.76,.74,.64];
      write(edges,sphere.corners[a]!,colour,-1);write(edges,sphere.corners[b]!,colour,-1);
    }
    const faceData=new Float32Array(faces),edgeData=new Float32Array(edges),indexData=new Uint16Array(triangles);
    this.face=this.buffer(gl.ARRAY_BUFFER,faceData);this.edges=this.buffer(gl.ARRAY_BUFFER,edgeData);
    this.indices=this.buffer(gl.ELEMENT_ARRAY_BUFFER,indexData);
    this.selected=this.buffer(gl.ARRAY_BUFFER,new Float32Array(12*7),gl.DYNAMIC_DRAW);
    this.count=triangles.length;this.edgeCount=edges.length/7;
    this.bytes=faceData.byteLength+edgeData.byteLength+indexData.byteLength+12*7*4;
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(0,0,0,0);
  }
  private buffer(target:number,data:BufferSource,usage?:number){
    const gl=this.gl,b=gl.createBuffer();if(!b)throw Error('Graphics buffer unavailable');
    gl.bindBuffer(target,b);gl.bufferData(target,data,usage??gl.STATIC_DRAW);this.buffers.push(b);return b;
  }
  private bind(buffer:WebGLBuffer){
    const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    this.attrs.forEach((id,i)=>{gl.enableVertexAttribArray(id);gl.vertexAttribPointer(id,i===2?1:3,gl.FLOAT,false,28,i===0?0:i===1?12:24);});
  }
  resize(width:number,height:number,quality=1){
    const dpr=Math.min(devicePixelRatio||1,1.75)*quality;
    this.canvas.width=Math.max(1,Math.round(width*dpr));this.canvas.height=Math.max(1,Math.round(height*dpr));
  }
  render(q:Quat,zoom:number,selection:number|null,pulse:number){
    if(this.disposed || this.gl.isContextLost())return;
    const gl=this.gl,u=this.uniforms;this.frames++;
    gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);
    gl.uniform4f(u.uRotation!,...q);gl.uniform1f(u.uAspect!,this.canvas.width/this.canvas.height);
    gl.uniform1f(u.uFocal!,focal(this.canvas.width/this.canvas.height,zoom));
    gl.uniform1f(u.uSelected!,selection??-2);gl.uniform1f(u.uPulse!,pulse);gl.uniform1f(u.uLine!,0);
    gl.disable(gl.BLEND);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1,1);
    this.bind(this.face);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indices);gl.drawElements(gl.TRIANGLES,this.count,gl.UNSIGNED_SHORT,0);
    gl.disable(gl.POLYGON_OFFSET_FILL);gl.enable(gl.BLEND);gl.uniform1f(u.uLine!,1);
    this.bind(this.edges);gl.drawArrays(gl.LINES,0,this.edgeCount);
    if(selection!==null){
      if(this.selectedId!==selection){
        const c=this.sphere.cells[selection]!,vertices:number[]=[];
        for(let i=0;i<c.corners.length;i++)for(const id of [c.corners[i]!,c.corners[(i+1)%c.corners.length]!])
          vertices.push(...this.sphere.corners[id]!,.95,.91,.79,selection);
        gl.bindBuffer(gl.ARRAY_BUFFER,this.selected);gl.bufferSubData(gl.ARRAY_BUFFER,0,new Float32Array(vertices));
        this.selectionCount=vertices.length/7;this.selectedId=selection;
      }
      gl.uniform1f(u.uLine!,2);this.bind(this.selected);gl.drawArrays(gl.LINES,0,this.selectionCount);
    }
  }
  dispose(release=false){
    if(this.disposed)return;this.disposed=true;
    for(const b of this.buffers)this.gl.deleteBuffer(b);this.gl.deleteProgram(this.program);
    if(release)this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
