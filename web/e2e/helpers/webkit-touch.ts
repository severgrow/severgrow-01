import {createRequire} from 'node:module';
import path from 'node:path';
/** Shared adapter from the existing Territory iOS suite. The pinned Playwright WebKit transport
 * supports trusted multi-touch although its public client exposes only tap. Fail if it changes. */
export const captureWebKitTouch=()=>{
  const proxy:{session:any}={session:null};
  const require=createRequire(import.meta.url);
  try{
    const root=path.dirname(require.resolve('playwright-core/package.json'));
    const input=require(path.join(root,'lib/server/webkit/wkInput.js'));
    const original=input.RawTouchscreenImpl.prototype.tap;
    input.RawTouchscreenImpl.prototype.tap=async function(this:any,progress:any,x:number,y:number,modifiers:number){
      proxy.session=this._pageProxySession;
      return original.call(this,progress,x,y,modifiers);
    };
  }catch{/* The caller must assert the captured session after a real packaged tap. */}
  return proxy;
};
