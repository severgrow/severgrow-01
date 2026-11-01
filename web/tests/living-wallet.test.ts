import {expect,it} from 'vitest';
import {WorldView} from '../src/online/world-view.js';
import type {SeedWallet} from '../../server/src/seeds/types.js';
const wallet=(balance:number):SeedWallet=>({balance,lifetimeEarned:balance,lifetimeSpent:0,worldInvitationSeen:true});
const fixture=()=>{
 const state={active:false,menuPreview:true,identity:{playerId:'one',token:'token'},wallet:wallet(100),world:null,svg:null};
 Object.setPrototypeOf(state,WorldView.prototype);
 return {state,view:state as unknown as WorldView};
};
it('reuses only the same player’s authoritative menu wallet',()=>{
 const {state,view}=fixture();const fresh=wallet(400);view.useMenuWallet('one',fresh);expect(state.wallet).toBe(fresh);
});
it('cannot attach another player’s balance to the map',()=>{
 const {state,view}=fixture();view.useMenuWallet('other',wallet(900));expect(state.wallet.balance).toBe(100);
});
it('never overwrites active Territory or a non-menu presentation with an older menu read',()=>{
 const {state,view}=fixture();state.active=true;view.useMenuWallet('one',wallet(900));expect(state.wallet.balance).toBe(100);
 state.active=false;state.menuPreview=false;view.useMenuWallet('one',wallet(900));expect(state.wallet.balance).toBe(100);
});
