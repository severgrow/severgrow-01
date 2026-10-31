/** Real browser + real account router; only Supabase mail/token delivery is faked. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { createAccountsRouter, MemoryIdentityLinkStore, supabaseAuthProvider } from '../../server/src/accounts/accounts.js';

const port = (server: ReturnType<typeof createServer>) => (server.address() as AddressInfo).port;
let mailRequests=0, enabled=true, loseExchange=false, googleOn=false;
const consumed=new Set<string>();
const tokens = new Map<string,string>();
const mail = createServer((req,res)=>{
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'apikey,authorization,content-type','content-type':'application/json'};
  const reply=(status:number,body:unknown)=>{res.writeHead(status,headers);res.end(JSON.stringify(body));};
  if(req.method==='OPTIONS')return reply(200,{});
  const path=new URL(req.url!,'http://local').pathname;
  if(path==='/auth/v1/settings')return reply(200,{external:{email:true,google:googleOn}});
  if(path==='/auth/v1/user'){
    const email=tokens.get((req.headers.authorization??'').replace('Bearer ',''));
    return email?reply(200,{id:email,email,email_confirmed_at:new Date().toISOString(),app_metadata:{providers:['email']}}):reply(401,{});
  }
  if(path.startsWith('/auth/v1/admin/users/'))return reply(200,{});
  if(path==='/auth/v1/logout')return reply(200,{});
  let body=''; req.on('data',chunk=>body+=String(chunk));req.on('end',()=>{
    const data=JSON.parse(body||'{}') as {email?:string;token?:string};
    if(path==='/auth/v1/otp'){consumed.delete(data.email!);mailRequests++;return reply(200,{});}
    if(path==='/auth/v1/verify'){
      if(data.token!=='12345678'||consumed.has(data.email!))return reply(403,{message:'Invalid or expired'});
      consumed.add(data.email!);
      const token=`verified-${randomUUID()}`;tokens.set(token,data.email!);return reply(200,{access_token:token});
    }
    return reply(404,{});
  });
});
await new Promise<void>(r=>mail.listen(0,'127.0.0.1',r));
const supabase=`http://127.0.0.1:${port(mail)}`;
const storage=new MemoryStorage(),service=new MatchService({storage,config:{...DEFAULT_SERVER_CONFIG,corsOrigins:['*']}});
const links=new MemoryIdentityLinkStore((p,k,n)=>storage.revokeTokensOfPlayer(p,k,n));
const router=createAccountsRouter({storage,links,emailEnabled:true,auth:supabaseAuthProvider({url:supabase,anonKey:'local',serviceRoleKey:'sb_secret_local'}),authenticate:t=>service.authenticate(t),now:Date.now});
const api=createHttpServer({service,config:{...DEFAULT_SERVER_CONFIG,corsOrigins:['*']},live:async(req,path)=>{
  if(path==='/v1/auth/methods'&&!enabled)return {status:404,body:{}};
  const result=await router(req,path);
  if(path==='/v1/auth/email'&&loseExchange){loseExchange=false;return {status:503,body:{code:'INTERNAL'}};}
  return result;
}});
await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));
const apiBase=`http://127.0.0.1:${port(api)}`;
await new Promise<void>((resolve,reject)=>{
  const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','build','--config','web/vite.config.ts'],{env:{...process.env,CHANNEL:'futa05',VITE_DUEL_API_URL:apiBase,VITE_SUPABASE_URL:supabase,VITE_SUPABASE_ANON_KEY:'local',VITE_ACCOUNTS:'on'},stdio:'ignore'});
  child.on('exit',code=>code===0?resolve():reject(new Error(`build ${code}`)));
});
const server=await preview({configFile:'web/vite.config.ts',preview:{host:'127.0.0.1',port:0},logLevel:'silent'});
const origin=`http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM??'/usr/bin/chromium',args:['--no-sandbox']});
let checks=0;const check=(name:string,condition:unknown)=>{assert(condition,name);console.log(`PASS ${name}`);checks++;};
const guest=await service.createGuest(),friend=await service.createGuest();
const match=await service.createMatch(await service.authenticate(guest.token));
await service.joinMatch(await service.authenticate(friend.token),match.match.inviteCode);
try {
  const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
  await context.addInitScript(({guest})=>{
    if(!localStorage.getItem('futa05:severgrow.duel.identity.v1')) localStorage.setItem('futa05:severgrow.duel.identity.v1',JSON.stringify({token:guest.token,playerId:guest.player.id,displayName:guest.player.displayName,kind:'guest'}));
  },{guest});
  const page=await context.newPage();page.setDefaultTimeout(15000);await page.goto(origin);await page.waitForSelector('#menu-login[data-owned="1"]');
  await page.click('#menu-login');await page.waitForSelector('#acct-email:not([hidden])');
  check('email-only project exposes account creation without Google',await page.locator('#acct-email').isVisible()&&!(await page.locator('[data-acct="email-google"]').isVisible()));
  await page.fill('#acct-email-address','test@example.com');await page.click('[data-acct="email-submit"]');await page.waitForSelector('#acct-email-code:not([hidden]):not(:disabled)');
  check('code requested once',mailRequests===1);
  mkdirSync('/tmp/account-polish-shots',{recursive:true});
  await page.screenshot({path:'/tmp/account-polish-shots/email-code-phone-ready.png'});
  await page.click('#acct-email button:has-text("Resend code")');check('rapid resend blocked',mailRequests===1);
  await page.fill('#acct-email-code','99999999');await page.click('[data-acct="email-submit"]');await page.waitForSelector('#acct-email .acct-status[data-tone="bad"]');
  check('bad code preserves address and draft',await page.inputValue('#acct-email-address')==='test@example.com'&&await page.inputValue('#acct-email-code')==='99999999');
  mkdirSync('/tmp/account-polish-shots',{recursive:true});
  await page.screenshot({path:'/tmp/account-polish-shots/email-code-phone.png'});
  const fit=await page.locator('#acct-email').boundingBox();check('phone panel stays inside screen',fit&&fit.x>=0&&fit.y>=0&&fit.x+fit.width<=393&&fit.y+fit.height<=852);
  await page.fill('#acct-email-code','12345678');loseExchange=true;
  await page.click('[data-acct="email-submit"]');await page.waitForSelector('#acct-email .acct-status[data-tone="bad"]');
  check('failed server exchange remains retryable',await page.inputValue('#acct-email-code')==='12345678');
  await page.click('[data-acct="email-submit"]');await page.waitForSelector('#acct-nickname:not([hidden])');
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('severgrow.duel.identity.v1')!) as {playerId:string;kind:string;token:string});
  const signed=await read();check('guest upgraded in place after retry',signed.playerId===guest.player.id&&signed.kind==='account');
  check('existing match preserved',(await service.listMyMatches(await service.authenticate(signed.token))).some(m=>m.matchId===match.match.matchId));
  check('no duplicate identity after lost response',links.rows.length===1);
  await page.fill('#acct-nickname input','Fern');await page.click('[data-acct="nickname-save"]');await page.waitForSelector('#acct-nickname',{state:'hidden'});
  await context.close();
  const second=await browser.newPage({viewport:{width:320,height:568},isMobile:true,hasTouch:true});
  await second.goto(origin);await second.waitForSelector('#menu-login[data-owned="1"]');await second.click('#menu-login');await second.fill('#acct-email-address','test@example.com');await second.click('[data-acct="email-submit"]');await second.waitForSelector('#acct-email-code:not([hidden]):not(:disabled)');
  const narrow=await second.locator('#acct-email').boundingBox();
  check('320px panel stays inside the viewport',narrow&&narrow.x>=0&&narrow.x+narrow.width<=320&&narrow.y>=0&&narrow.y+narrow.height<=568);
  check('text fields do not trigger iOS focus zoom',await second.locator('#acct-email-code').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));
  await second.screenshot({path:'/tmp/account-polish-shots/email-code-320.png'});
  await second.fill('#acct-email-code','12345678');await second.click('[data-acct="email-submit"]');
  await second.waitForFunction(()=>document.querySelector('#menu-login')?.textContent?.includes('Fern'));
  const recovered=await second.evaluate(()=>JSON.parse(localStorage.getItem('severgrow.duel.identity.v1')!) as {playerId:string});
  check('second phone recovers same account and nickname',recovered.playerId===guest.player.id);
  check('returning account is not asked for nickname again',!(await second.locator('#acct-nickname').isVisible()));
  enabled=false;await second.reload();await second.waitForSelector('#menu-login[data-owned="1"]');
  check('existing account remains manageable when new email sign-ins are disabled',await second.locator('#menu-login').isVisible()&&(await second.locator('#menu-login').textContent())?.includes('Fern'));
  enabled=true;await second.close();
  const fresh=await browser.newPage({viewport:{width:393,height:852}});
  await fresh.goto(origin);await fresh.waitForSelector('#menu-login[data-owned="1"]');await fresh.click('#menu-login');
  await fresh.fill('#acct-email-address','new@example.com');await fresh.click('[data-acct="email-submit"]');
  await fresh.waitForSelector('#acct-email-code:not([hidden]):not(:disabled)');await fresh.fill('#acct-email-code','12345678');
  loseExchange=true;await fresh.click('[data-acct="email-submit"]');await fresh.waitForSelector('#acct-email .acct-status[data-tone="bad"]');
  await fresh.click('[data-acct="email-submit"]');await fresh.waitForSelector('#acct-nickname:not([hidden])');
  check('first signup without a guest still gets its nickname after a lost response',await fresh.locator('#acct-nickname').isVisible());
  await fresh.close();
  googleOn=true;
  const desktop=await browser.newPage({viewport:{width:1280,height:800}});
  await desktop.goto(origin);await desktop.waitForSelector('#menu-login[data-owned="1"]');await desktop.click('#menu-login');
  check('Google remains an alternative next to email',await desktop.locator('[data-acct="email-google"]').isVisible());
  await desktop.screenshot({path:'/tmp/account-polish-shots/email-desktop.png'});
  await desktop.keyboard.press('Escape');await desktop.waitForSelector('#acct-email',{state:'hidden'});
  check('Escape closes and restores keyboard focus',await desktop.locator('#menu-login').evaluate(e=>e===document.activeElement));
  await desktop.close();googleOn=false;
  enabled=false;const old=await browser.newPage();await old.goto(origin);
  await old.waitForFunction(()=>document.querySelector('#menu-login')?.getAttribute('data-owned')==='1');
  check('old server hides unavailable email option',!(await old.locator('#menu-login').isVisible()));
  await old.close();console.log(`${checks} email browser checks passed`);
} finally {
  await browser.close();await server.close();await new Promise<void>(r=>api.close(()=>r()));await new Promise<void>(r=>mail.close(()=>r()));
}
