(function(root){
  'use strict';
  const FIELDS=['社会科学','心理学','经济学','文学','计算机','物理','数学','医学','护理学','电子','工商管理','金融','人工智能'];
  const shuffle=(items,random=Math.random)=>{const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
  function create(bank,raw={},random=Math.random){
    if(!raw||typeof raw!=='object')raw={};
    const byId=new Map(bank.map(q=>[q.id,q])),valid=id=>typeof id==='string'&&byId.has(id);
    const unique=xs=>[...new Set(Array.isArray(xs)?xs.filter(valid):[])];
    const integer=n=>Number.isInteger(n)&&n>=0&&n<4;
    const state={schema:1,field:FIELDS.includes(raw.field)?raw.field:'',seen:unique(raw.seen),saved:unique(raw.saved),history:[],paperVotes:{},current:null,timer:null};
    if(raw.paperVotes&&typeof raw.paperVotes==='object')for(const [id,vote]of Object.entries(raw.paperVotes))if(valid(id)&&['top','regular'].includes(vote))state.paperVotes[id]=vote;
    if(Array.isArray(raw.history))state.history=raw.history.filter(h=>h&&valid(h.id)&&integer(h.choice)&&Number.isFinite(h.at)).slice(-1000).map(h=>({id:h.id,choice:h.choice,at:h.at}));
    const c=raw.current;
    if(c&&valid(c.id)&&(!state.field||byId.get(c.id).field===state.field)&&Array.isArray(c.order)&&c.order.length===4&&new Set(c.order).size===4&&c.order.every(integer))state.current={id:c.id,order:[...c.order],draft:integer(c.draft)?c.draft:null,choice:integer(c.choice)?c.choice:null};
    const t=raw.timer;
    if(t&&valid(t.id)&&Number.isFinite(t.remaining)&&t.remaining>=0&&t.remaining<=300&&[120,300].includes(t.duration))state.timer={id:t.id,duration:t.duration,remaining:t.remaining,deadline:Number.isFinite(t.deadline)?t.deadline:null,done:!!t.done,own:!!t.own};
    function next(){
      const pool=bank.filter(q=>!state.field||q.field===state.field);if(!pool.length)return null;
      let fresh=pool.filter(q=>!state.seen.includes(q.id));
      if(!fresh.length){const ids=new Set(pool.map(q=>q.id));state.seen=state.seen.filter(id=>!ids.has(id));fresh=pool.filter(q=>pool.length===1||q.id!==state.current?.id)}
      const fields=[...new Set(fresh.map(q=>q.field))],field=fields[Math.floor(random()*fields.length)];
      const options=fresh.filter(q=>q.field===field),q=options[Math.floor(random()*options.length)];
      state.current={id:q.id,order:shuffle([0,1,2,3],random),draft:null,choice:null};
      if(!state.seen.includes(q.id))state.seen.push(q.id);return q;
    }
    const current=()=>byId.get(state.current?.id);
    function draft(index){if(!integer(index)||!state.current||state.current.choice!==null)return false;state.current.draft=index;return true}
    function answer(now=Date.now()){
      const c=state.current,q=current();if(!q||c.draft===null||c.choice!==null)return null;
      c.choice=c.draft;state.history.push({id:q.id,choice:c.choice,at:now});state.history=state.history.slice(-1000);return c.choice===q.answer;
    }
    function guessPaper(vote){
      const q=current();if(!q||state.current.choice===null||!['top','regular'].includes(vote)||state.paperVotes[q.id]||!['top','regular'].includes(q.paper?.tier))return null;
      state.paperVotes[q.id]=vote;return vote===q.paper.tier;
    }
    function setField(field){if(field!==''&&!FIELDS.includes(field))return false;state.field=field;next();return true}
    function bookmark(id=state.current?.id){if(!valid(id))return false;const i=state.saved.indexOf(id);if(i>=0)state.saved.splice(i,1);else state.saved.unshift(id);return i<0}
    function revisit(id){if(!valid(id))return false;state.field='';const prior=[...state.history].reverse().find(h=>h.id===id);state.current={id,order:shuffle([0,1,2,3],random),draft:prior?.choice??null,choice:prior?.choice??null};return true}
    function today(now=Date.now()){const date=new Date(now).toDateString();return new Set(state.history.filter(h=>new Date(h.at).toDateString()===date).map(h=>h.id)).size}
    function startTimer(id=state.current?.id,duration=120,now=Date.now(),own=false){
      if(!valid(id)||![120,300].includes(duration))return false;
      state.timer={id,duration,remaining:duration,deadline:now+duration*1000,done:false,own:!!own};return true;
    }
    function timerRemaining(now=Date.now()){
      const t=state.timer;if(!t)return 0;
      if(t.deadline!==null){t.remaining=Math.max(0,Math.min(t.duration,Math.ceil((t.deadline-now)/1000)));if(t.remaining===0){t.done=true;t.deadline=null}}
      return t.remaining;
    }
    function pauseTimer(now=Date.now()){if(!state.timer)return false;timerRemaining(now);state.timer.deadline=null;return true}
    function resumeTimer(now=Date.now()){const t=state.timer;if(!t||t.done||t.remaining<=0)return false;t.deadline=now+t.remaining*1000;return true}
    const snapshot=()=>JSON.parse(JSON.stringify(state));
    if(!state.current)next();
    return {state,byId,current,next,draft,answer,guessPaper,setField,bookmark,revisit,today,startTimer,timerRemaining,pauseTimer,resumeTimer,snapshot};
  }
  const api={FIELDS,shuffle,create};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.WarmupCore=api;
})(typeof window!=='undefined'?window:globalThis);
