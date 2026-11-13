/** Passive counters: no animation loop of its own, no synchronous GPU readback. */
export const ACTIVITY_PROBE = `(() => {
  window.__name = f => f;
  const p = window.__activity = {on:false, counts:{}, frames:[], long:[], last:0};
  const count = (key,n=1) => { if(p.on) p.counts[key]=(p.counts[key]||0)+n; };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => { count('rafScheduled'); return raf(t => {
    count('rafExecuted'); if(p.on && t!==p.last){if(p.last)p.frames.push(t-p.last);p.last=t;} cb(t);
  }); };
  const rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function(){count('rectReads');return rect.call(this);};
  for(const name of ['setTimeout','setInterval']){
    const f=window[name].bind(window);window[name]=(cb,delay,...args)=>f(typeof cb==='function'?function(...a){count('timer:'+delay);return cb.apply(this,a);}:cb,delay,...args);
  }
  for(const name of ['width','height']){
    const d=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,name);
    Object.defineProperty(HTMLCanvasElement.prototype,name,{...d,set(v){count('canvasResize');if(d.get.call(this)===v)count('sameSizeResize');d.set.call(this,v);}});
  }
  const gl=WebGLRenderingContext.prototype;
  const states=new WeakMap();
  const state=c=>{if(!states.has(c))states.set(c,{viewport:[0,0,0,0],scissor:[0,0,0,0],clipped:false});return states.get(c);};
  for(const name of ['viewport','scissor','enable','disable']){
    const f=gl[name];gl[name]=function(...args){const s=state(this);if(name==='viewport'||name==='scissor')s[name]=args;else if(args[0]===this.SCISSOR_TEST){s.clipped=name==='enable';count(name+':scissor');}return f.apply(this,args);};
  }
  for(const name of ['drawArrays','drawElements','getAttribLocation','bufferData','bufferSubData','texImage2D','texSubImage2D']){
    const f=gl[name];gl[name]=function(...args){count(name);if(name==='getAttribLocation')count('attribute:'+args[1]);if(name==='drawArrays'){count('vertices',args[2]);const s=state(this),v=s.clipped?s.scissor:s.viewport;count('submittedPixelBounds',v[2]*v[3]);}return f.apply(this,args);};
  }
  try{new PerformanceObserver(list=>{if(p.on)for(const e of list.getEntries())p.long.push(e.duration);}).observe({type:'longtask',buffered:false});}catch{}
  p.begin=()=>{p.counts={};p.frames=[];p.long=[];p.last=0;p.on=true;};
  p.end=()=>{p.on=false;return {counts:p.counts,rafGaps:p.frames,longTasks:p.long};};
})();`;
