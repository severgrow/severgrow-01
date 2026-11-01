// A codec can erase the game's one-pixel grain even at a high bitrate. Match the decoded
// result once per encoder configuration; don't globally strengthen the game or guess that
// every phone's hardware encoder behaves like Chromium's software encoder.
export type ReplayFilmMatch = { key: number; frame: number };
const original: ReplayFilmMatch = { key: 1, frame: 1 };
const gains = new Map<string, ReplayFilmMatch>();
const candidates = [1, 2.4, 1.7] as const;

/** The recorder has its own codec preprocessing; measure it rather than borrowing AVC's gain. */
const recordedProbe = (source: HTMLCanvasElement, target: HTMLCanvasElement, mime: string, bitrate: number, paint:()=>void) => {
  source.width = source.width;
  paint();
  let stream=source.captureStream(0);
  let track=stream.getVideoTracks()[0] as MediaStreamTrack & {requestFrame?:()=>void};
  if(!track?.requestFrame){stream.getTracks().forEach(t=>t.stop());stream=source.captureStream(30);track=stream.getVideoTracks()[0]!;}
  track.contentHint='detail';
  let recorder:MediaRecorder;
  try{recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:bitrate});}
  catch(error){stream.getTracks().forEach(t=>t.stop());throw error;}
  const video=document.createElement('video');video.muted=true;video.playsInline=true;
  const chunks:Blob[]=[];let url='',disposed=false;
  let rejectProbe:(error:Error)=>void=()=>{};
  const done=new Promise<void>((resolve,reject)=>{
    rejectProbe=reject;
    recorder.ondataavailable=e=>{if(!disposed&&e.data.size)chunks.push(e.data);};
    recorder.onerror=()=>reject(new Error('film recording failed'));
    recorder.onstop=()=>{
      stream.getTracks().forEach(t=>t.stop());if(disposed)return;
      url=URL.createObjectURL(new Blob(chunks,{type:mime}));
      video.onerror=()=>reject(new Error('film recording decode failed'));
      video.onloadeddata=()=>{
        // Seeking commits the decoded surface; loadeddata alone may still draw black.
        video.onseeked=()=>{
          if(disposed)return;
          try{target.getContext('2d')!.drawImage(video,0,0);resolve();}catch(error){reject(error);}
        };
        video.currentTime=0;
      };
      video.src=url;
    };
  });
  void done.catch(()=>undefined);
  let raf=0;
  const publish=()=>{if(!disposed&&recorder.state!=='inactive'){try{paint();track.requestFrame?.();}catch(error){rejectProbe(error instanceof Error?error:new Error(String(error)));}}};
  try{recorder.start();raf=requestAnimationFrame(publish);}
  catch(error){stream.getTracks().forEach(t=>t.stop());throw error;}
  // Two timestamps give native muxers a real duration (a single zero-duration frame can
  // produce a header-only recording). This is finite, export-only work.
  const frameTimer=setTimeout(()=>{raf=requestAnimationFrame(publish);},160);
  const timer=setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop();},600);
  return {done,dispose:()=>{
    if(disposed)return;disposed=true;clearTimeout(timer);clearTimeout(frameTimer);cancelAnimationFrame(raf);
    if(recorder.state!=='inactive')recorder.stop();stream.getTracks().forEach(t=>t.stop());
    video.onloadeddata=video.onseeked=video.onerror=null;video.pause();video.removeAttribute('src');video.load();
    if(url)URL.revokeObjectURL(url);rejectProbe(new Error('film probe disposed'));
  }};
};

const texture = (canvas: HTMLCanvasElement): { spread: number; mean: number } => {
  // This corner is outside names, score, board and signature in every replay frame.
  const w=40,h=80,a=canvas.getContext('2d')!.getImageData(8,8,w,h).data;
  let sum=0,sq=0,total=0,n=0;
  const at=(x:number,y:number)=>{const i=(y*w+x)*4;return(a[i]!+a[i+1]!+a[i+2]!)/3;};
  for(let y=0;y<h;y++)for(let x=1;x<w-1;x++){
    const value=at(x,y),d=value-(at(x-1,y)+at(x+1,y))/2;
    sum+=d;sq+=d*d;total+=value;n++;
  }
  return {spread:Math.sqrt(Math.max(0,sq/n-(sum/n)**2)),mean:total/n};
};

/** At most three probes, a five-second budget, no idle work or network. */
export const matchReplayFilm = async (
  canvas: HTMLCanvasElement, config: VideoEncoderConfig,
  paint: (gain: number) => void, signal?: AbortSignal,
  recordMime?: string,
): Promise<ReplayFilmMatch> => {
  if(signal?.aborted)return original;
  if(recordMime?typeof MediaRecorder==='undefined':typeof VideoEncoder==='undefined'||typeof VideoDecoder==='undefined')return original;
  const key=JSON.stringify({config,recordMime}),cached=gains.get(key);
  if(cached!==undefined)return cached;
  const decoded=document.createElement('canvas');decoded.width=canvas.width;decoded.height=canvas.height;
  let encoder:VideoEncoder|null=null,decoder:VideoDecoder|null=null;
  let native:ReturnType<typeof recordedProbe>|null=null;
  const close=()=>{
    native?.dispose();native=null;
    try{if(encoder&&encoder.state!=='closed')encoder.close();}catch{/* driver already closed */}
    try{if(decoder&&decoder.state!=='closed')decoder.close();}catch{/* driver already closed */}
  };
  let timer:ReturnType<typeof setTimeout>|undefined;
  let interrupt=()=>{};
  const deadline=new Promise<never>((_,reject)=>{
    interrupt=()=>{close();reject(new Error('film probe interrupted'));};
    timer=setTimeout(interrupt,5000);signal?.addEventListener('abort',interrupt,{once:true});
  });
  const measure=async()=>{
    paint(1);const reference=texture(canvas);
    if(reference.spread<.1)return original;
    let bestKey=1,bestFrame=1,keyError=Infinity,frameError=Infinity;
    const error=(observed:ReturnType<typeof texture>)=>Math.abs(1-observed.spread/reference.spread)+Math.abs(observed.mean-reference.mean)/12;
    const matches=(observed:ReturnType<typeof texture>)=>observed.spread/reference.spread>=.8&&observed.spread/reference.spread<=1.2&&Math.abs(observed.mean-reference.mean)<3;
    for(const gain of recordMime ? [1, 4.5, 2.75] : candidates){
      if(signal?.aborted)throw new Error('film probe interrupted');
      paint(gain);
      let first:ReturnType<typeof texture>|undefined,last:ReturnType<typeof texture>|undefined;
      if(recordMime){
        native=recordedProbe(canvas,decoded,recordMime,config.bitrate??5_000_000,()=>paint(gain));
        await native.done;native.dispose();native=null;
        first=last=texture(decoded);
      }else{
      const chunks:EncodedVideoChunk[]=[];let description:VideoDecoderConfig|undefined;
      let failure:DOMException|null=null;
      encoder=new VideoEncoder({output:(chunk,meta)=>{chunks.push(chunk);description??=meta?.decoderConfig;},error:e=>{failure=e;}});
      encoder.configure(config);
      // The initial keyframe and subsequent predictive frames can retain very different
      // amounts of fine detail. Measure both so the film doesn't strengthen during playback.
      for(let i=0;i<12;i++){
        const frame=new VideoFrame(canvas,{timestamp:i*33333,duration:33333});
        try{encoder.encode(frame,{keyFrame:i===0});}finally{frame.close();}
        while(encoder.encodeQueueSize>3&&!failure)await new Promise(r=>setTimeout(r,0));
      }
      await encoder.flush();encoder.close();encoder=null;
      if(failure||!description||!chunks.length)throw failure??new Error('no film probe frame');
      let frames=0;
      decoder=new VideoDecoder({output:picture=>{
        try{
          decoded.getContext('2d')!.drawImage(picture,0,0);frames++;
          last=texture(decoded);first??=last;
        }finally{picture.close();}
      },error:e=>{failure=e;}});
      decoder.configure(description);for(const chunk of chunks){
        decoder.decode(chunk);
        while(decoder.decodeQueueSize>3&&!failure)await new Promise(r=>setTimeout(r,0));
      }
      await decoder.flush();decoder.close();decoder=null;
      if(failure||!frames)throw failure??new Error('no decoded film probe');
      }
      if(!first||!last)throw new Error('no film measurements');
      if(error(first)<keyError){keyError=error(first);bestKey=gain;}
      if(error(last)<frameError){frameError=error(last);bestFrame=gain;}
      if(matches(first)&&matches(last))break;
    }
    return {key:bestKey,frame:bestFrame};
  };
  try{
    const gain=await Promise.race([measure(),deadline]);
    if(!signal?.aborted){if(gains.size>=4)gains.clear();gains.set(key,gain);}
    return gain;
  }catch{return original;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',interrupt);close();decoded.width=decoded.height=1;}
};
