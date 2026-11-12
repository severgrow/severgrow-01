// Isolated local preview: real renderer + real in-memory Territory service, never the live DB.
// Run: npx tsx scripts/preview-living-territory.ts   (optional PREVIEW_PORT=5187)
import type { AddressInfo } from 'node:net';
import { createServer } from 'vite';
import { DEFAULT_SERVER_CONFIG } from '../server/src/config.js';
import { createHttpServer } from '../server/src/http.js';
import { createWorldEconomyRouter } from '../server/src/seeds/router.js';
import { MemoryWorldEconomyStore } from '../server/src/seeds/memory.js';
import { WorldEconomyService } from '../server/src/seeds/service.js';
import { MatchService } from '../server/src/service.js';
import { MemoryStorage } from '../server/src/storage/memory.js';
const storage=new MemoryStorage(),store=new MemoryWorldEconomyStore();
const config={...DEFAULT_SERVER_CONFIG,corsOrigins:['*']};
const economy=new WorldEconomyService(store,storage),service=new MatchService({storage,config,economy});
const api=createHttpServer({service,config,live:createWorldEconomyRouter({economy,authenticate:t=>service.authenticate(t)})});
await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${(api.address() as AddressInfo).port}`;
const guest=async()=>await(await fetch(`${base}/v1/guests`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).json() as {token:string;player:{id:string;kind:string;displayName:string|null}};
const players=await Promise.all([guest(),guest(),guest()]);
for(const [i,player]of players.entries()){
 await store.adminAdjustSeeds({playerId:player.player.id,delta:2400,reason:'local preview',actorId:'preview',requestId:`preview-fund-${i}`,now:Date.now()});
 await store.acknowledgeInvitation(player.player.id);
 const cells=[['-2,-4','-1,-4','-2,-3','-3,-3'],['0,0','1,0','2,0'],['3,-6','-5,3','-4,3']][i]!;
 for(const [j,cell]of cells.entries())await store.claim(player.player.id,cell,`preview-land-${i}-${j}`,Date.now()-3600000);
}
const me=players[0]!;
const identity=JSON.stringify({token:me.token,playerId:me.player.id,kind:me.player.kind,displayName:me.player.displayName});
const settings=JSON.stringify({sound:false,music:false,coach:false,eyeCandy:true});
process.env.CHANNEL='futa04';process.env.VITE_DUEL_API_URL='/__territory-preview';
const web=await createServer({cacheDir:'/tmp/living-preview-vite',configFile:'web/vite.config.ts',
 server:{host:'0.0.0.0',port:Number(process.env.PREVIEW_PORT??5187),strictPort:true,
  proxy:{'/__territory-preview':{target:base,rewrite:p=>p.replace(/^\/__territory-preview/,'')}},
 },
 plugins:[{name:'isolated-territory-preview',transformIndexHtml(html){
  const init=`localStorage.setItem('main2:severgrow.duel.identity.v1',${JSON.stringify(identity)});localStorage.setItem('main2:severgrow.settings.v1',${JSON.stringify(settings)});localStorage.setItem('main2:severgrow.seen','1');`;
  return html.replace('<head>',`<head><script>${init}</script>`).replace('<title>','<title>LOCAL PREVIEW · ');
 }}],logLevel:'info',
});
await web.listen();web.printUrls();console.log('Local demo world. The feature uses the existing live map when integrated. No production data is touched.');
let closing=false;
const close=async()=>{if(closing)return;closing=true;await web.close();api.closeAllConnections();await new Promise<void>(r=>api.close(()=>r()));process.exit(0);};
process.once('SIGINT',()=>void close());process.once('SIGTERM',()=>void close());
