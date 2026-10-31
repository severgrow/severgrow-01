import { ACCOUNT } from '../../../src/strings.js';
import { createEmailAuth, emailAddress, emailCode } from './email-auth.js';

/** Compact two-step form; drafts/codes stay in memory and no background timer is needed. */
export const mountEmailPanel = (panel: HTMLElement, hooks: {
  supabase: {url:string;key:string}; alternative?:HTMLButtonElement; complete:(access:string)=>Promise<void>; close:()=>void;
}): {reset:()=>void} => {
  const auth = createEmailAuth(hooks.supabase);
  const make = <K extends keyof HTMLElementTagNameMap>(tag:K,text='') => {
    const node = document.createElement(tag); node.textContent = text; return node;
  };
  const title = make('h2',ACCOUNT.emailTitle), intro = make('p',ACCOUNT.emailBody);
  const form = make('form'); form.className='acct-email-form';
  const emailLabel = make('label',ACCOUNT.emailLabel), email = make('input');
  email.type='email'; email.autocomplete='email'; email.required=true; email.maxLength=254;
  email.id='acct-email-address'; emailLabel.htmlFor=email.id; email.spellcheck=false; email.autocapitalize='none';
  const codeLabel = make('label',ACCOUNT.emailCodeLabel), code = make('input');
  code.type='text'; code.inputMode='numeric'; code.autocomplete='one-time-code'; code.maxLength=10;
  code.id='acct-email-code'; codeLabel.htmlFor=code.id;
  const status = make('p'); status.className='acct-status'; status.setAttribute('role','status');
  const key = (text:string) => {const b=make('button',text); b.type='button'; b.className='acct-btn'; return b;};
  const send=key(ACCOUNT.emailSend); send.type='submit'; send.dataset.acct='email-submit';
  const resend=key(ACCOUNT.emailResend), change=key(ACCOUNT.emailChange), close=key(ACCOUNT.emailClose);
  close.dataset.acct='email-close';
  resend.className=change.className=close.className='acct-linkbtn';
  const extra=make('div'); extra.className='acct-actions row'; extra.append(resend,change);
  form.append(emailLabel,email,codeLabel,code,status,send,extra);
  if(hooks.alternative)form.append(hooks.alternative);
  form.append(close); panel.append(title,intro,form);
  let address:string|null=null, busy=false, nextSend=0, pendingAccess:string|null=null;
  const setStatus=(text:string,bad=false) => {status.textContent=text;status.dataset.tone=bad?'bad':'';};
  const paint=() => {
    email.readOnly=address!==null; code.hidden=codeLabel.hidden=extra.hidden=address===null;
    code.required=address!==null; send.textContent=busy?ACCOUNT.working:address?ACCOUNT.emailVerify:ACCOUNT.emailSend;
    for(const control of [send,resend,change,email,code]) control.disabled=busy;
    close.disabled=busy;
    if(hooks.alternative)hooks.alternative.disabled=busy;
    form.setAttribute('aria-busy',String(busy));
  };
  const request=async (target:string) => {
    if(Date.now()<nextSend) {setStatus(ACCOUNT.emailLimited,true);return;}
    busy=true;paint();
    try {
      await auth.send(target); pendingAccess=null; address=target; nextSend=Date.now()+60_000;
      setStatus(ACCOUNT.emailSent(target)); paint(); code.focus({preventScroll:true});
    } catch(error) {setStatus(error instanceof Error&&error.message==='rate-limited'?ACCOUNT.emailLimited:ACCOUNT.emailSendFailed,true);}
    finally {busy=false;paint(); if(address&&!panel.hidden&&!panel.inert)code.focus({preventScroll:true});}
  };
  form.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.isComposing)event.preventDefault();});
  form.addEventListener('submit',event=>{
    event.preventDefault(); if(busy)return;
    if(!navigator.onLine){setStatus(ACCOUNT.offline,true);return;}
    if(!address){const target=emailAddress(email.value);if(!target){setStatus(ACCOUNT.emailInvalid,true);return;}void request(target);return;}
    const token=emailCode(code.value);if(!token){setStatus(ACCOUNT.emailCodeInvalid,true);return;}
    busy=true;paint();
    void (async()=>{
      pendingAccess ??= await auth.verify(address!,token);
      await hooks.complete(pendingAccess);
      pendingAccess=null;
    })().catch(error=>{
      if(error instanceof Error&&error.message==='account-session-expired')pendingAccess=null;
      setStatus(!navigator.onLine?ACCOUNT.offline:pendingAccess?ACCOUNT.emailRetry:error instanceof Error&&error.message==='rate-limited'?ACCOUNT.emailLimited:ACCOUNT.emailCodeFailed,true);
    }).finally(()=>{busy=false;paint();if(!panel.hidden&&!panel.inert)code.focus({preventScroll:true});});
  });
  resend.addEventListener('click',()=>{if(address&&!busy)void request(address);});
  change.addEventListener('click',()=>{address=null;pendingAccess=null;code.value='';setStatus('');paint();email.focus({preventScroll:true});});
  close.addEventListener('click',()=>{if(!busy)hooks.close();});
  paint();
  return {reset:()=>{if(busy)return;code.value='';setStatus(address?ACCOUNT.emailSent(address):'');paint();}};
};
