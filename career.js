/* Local career records and short, synthesized game sounds. */
(function(){
 'use strict';
 const KEY='paperparty:career:v1',SOUND='paperparty:sound',escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const read=()=>{try{const d=JSON.parse(localStorage.getItem(KEY));if(d&&d.schema===1&&Array.isArray(d.matches)&&d.players&&typeof d.players==='object')return d}catch{}return {schema:1,matches:[],players:{}}};
 const name=s=>String(s||'玩家').normalize('NFKC').trim().slice(0,12)||'玩家';
 let enabled=true,context=null;try{enabled=localStorage.getItem(SOUND)!=='off'}catch{}
 function sound(kind){if(!enabled||document.hidden)return;try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;context??=new Audio();if(context.state==='suspended')context.resume().catch(()=>{});const notes=kind==='correct'?[660,880]:kind==='wrong'?[300,240]:kind==='finish'?[523,659,784,1047]:kind==='lock'?[440,550]:[520];notes.forEach((hz,i)=>{const o=context.createOscillator(),g=context.createGain(),t=context.currentTime+i*.085;o.type='sine';o.frequency.value=hz;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.035,t+.01);g.gain.exponentialRampToValueAtTime(.001,t+.105);o.connect(g);g.connect(context.destination);o.start(t);o.stop(t+.12)})}catch{}}
 function record(match){
  const commit=()=>{if(!match||typeof match.id!=='string'||!['solo','duo','online'].includes(match.mode)||!Array.isArray(match.names)||!Array.isArray(match.points)||match.points.length!==(match.mode==='solo'?1:2)||match.names.length!==match.points.length||!match.points.every(p=>Number.isInteger(p)&&p>=0&&p<=100&&p%10===0))return false;
   const d=read();if(d.matches.includes(match.id))return false;const tied=match.points.length===2&&match.points[0]===match.points[1];
   match.names.forEach((raw,i)=>{const label=name(raw),key=JSON.stringify(label),p=d.players[key]||{name:label,games:0,duels:0,wins:0,draws:0,correct:0,questions:0};p.games++;p.correct+=match.points[i]/10;p.questions+=10;if(match.mode!=='solo'){p.duels++;if(tied)p.draws++;else if(match.points[i]>match.points[1-i])p.wins++}d.players[key]=p});
   d.matches.push(match.id);d.matches=d.matches.slice(-10000);try{localStorage.setItem(KEY,JSON.stringify(d));return true}catch{return false}};
  return navigator.locks?.request?navigator.locks.request('paperparty-career',commit):Promise.resolve(commit());
 }
 function rows(){return Object.values(read().players).sort((a,b)=>b.wins-a.wins||(b.correct/b.questions)-(a.correct/a.questions)||b.correct-a.correct||a.name.localeCompare(b.name,'zh-CN'))}
 function panel(){const data=rows();return `<p>本机保存，同一个昵称会继续累积。按胜场、正确率排序。</p><p>完整打完一局才计入；平局不算获胜，单人局只累积正确率。</p>${data.length?`<ol class="career-list">${data.map((p,i)=>`<li class="career-player"><div class="career-name"><span>${i+1}</span><strong>${escape(p.name)}</strong></div><div class="career-numbers"><span>胜场 <b>${p.wins}</b></span><span>生涯正确率 <b>${(p.correct/p.questions*100).toFixed(1)}%</b></span></div><p>完整对局 ${p.games} · 双人 ${p.duels} · 平局 ${p.draws}<br>累计答对 ${p.correct} / ${p.questions} 题</p></li>`).join('')}</ol>`:'<div class="empty">还没有战绩。完整玩一局，就能来这里看看。</div>'}`}
 window.PaperCareer={record,rows,panel,sound,get enabled(){return enabled},toggle(){enabled=!enabled;try{localStorage.setItem(SOUND,enabled?'on':'off')}catch{}if(enabled)sound('tap');return enabled}};
 document.addEventListener('pointerdown',()=>{if(enabled&&context?.state==='suspended')context.resume().catch(()=>{})});
})();
