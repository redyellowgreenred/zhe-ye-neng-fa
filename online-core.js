/* Shared two-player rules. Transport and DOM are deliberately outside this file. */
(function(root){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
  async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('')}
  const commitment=(round,index,player,vote,salt)=>digest(JSON.stringify([round,index,player,vote,salt]));
  class Room {
    constructor({room,name,fields,version,bank,snapshot}){
      this.bank=new Map(bank.map(q=>[q.id,q]));
      this.s=snapshot?clone(snapshot):{schema:1,room,names:[name,'好友'],fields:[...fields],version,guestToken:null,phase:'lobby',round:'',roundNo:0,questions:[],index:0,commits:[null,null],reveals:[null,null],next:[false,false],history:[],points:[0,0],revision:0};
      this.onChange=()=>{};
    }
    changed(){this.s.revision++;this.onChange(this.publicState());return true}
    publicState(){const s=clone(this.s);delete s.guestToken;if(!['reveal','finished'].includes(s.phase))s.reveals=[null,null];return s}
    join(token,name,version){if(typeof token!=='string'||token.length<16||version!==this.s.version||this.s.phase==='closed')return false;if(this.s.guestToken&&this.s.guestToken!==token)return false;this.s.guestToken=token;this.s.names[1]=String(name||'好友').trim().slice(0,12)||'好友';this.changed();return true}
    start(ids){if(!this.s.guestToken||!['lobby','finished'].includes(this.s.phase)||this.s.phase==='finished'&&!this.s.next.every(Boolean))return false;if(!Array.isArray(ids)||ids.length!==10||new Set(ids).size!==10||ids.some(id=>!this.bank.has(id)))return false;Object.assign(this.s,{phase:'choose',round:random(),roundNo:this.s.roundNo+1,questions:[...ids],index:0,commits:[null,null],reveals:[null,null],next:[false,false],history:[],points:[0,0]});return this.changed()}
    matches(round,index){return this.s.round===round&&this.s.index===index}
    commit(player,round,index,hash){if(![0,1].includes(player)||!this.matches(round,index)||!['choose','ready'].includes(this.s.phase)||!/^[a-f0-9]{64}$/.test(hash))return false;if(this.s.commits[player])return this.s.commits[player]===hash;this.s.commits[player]=hash;if(this.s.commits.every(Boolean))this.s.phase='ready';return this.changed()}
    requestReveal(round,index){if(!this.matches(round,index)||this.s.phase!=='ready'||!this.s.commits.every(Boolean))return false;this.s.phase='revealing';return this.changed()}
    async reveal(player,round,index,vote,salt){if(![0,1].includes(player)||!this.matches(round,index)||this.s.phase!=='revealing'||!['top','regular'].includes(vote)||typeof salt!=='string'||!/^[a-f0-9]{32}$/.test(salt))return false;const hash=await commitment(round,index,player,vote,salt);if(!this.matches(round,index)||this.s.phase!=='revealing'||hash!==this.s.commits[player])return false;if(this.s.reveals[player])return this.s.reveals[player].vote===vote&&this.s.reveals[player].salt===salt;this.s.reveals[player]={vote,salt};if(this.s.reveals.every(Boolean)){const votes=this.s.reveals.map(r=>r.vote),q=this.bank.get(this.s.questions[index]);this.s.history.push({id:q.id,votes});votes.forEach((v,p)=>{if(v===q.tier)this.s.points[p]+=10});this.s.phase='reveal'}return this.changed()}
    advance(player,round,index){if(![0,1].includes(player)||!this.matches(round,index)||this.s.phase!=='reveal')return false;if(this.s.next[player])return true;this.s.next[player]=true;if(this.s.next.every(Boolean)){this.s.index++;this.s.next=[false,false];this.s.commits=[null,null];this.s.reveals=[null,null];this.s.phase=this.s.index===10?'finished':'choose'}return this.changed()}
    rematch(player,ids){if(![0,1].includes(player)||this.s.phase!=='finished')return false;this.s.next[player]=true;if(this.s.next.every(Boolean))return this.start(ids);return this.changed()}
    close(){this.s.phase='closed';return this.changed()}
  }
  root.PaperOnlineCore={Room,commitment,digest,random};
})(typeof window==='undefined'?globalThis:window);
