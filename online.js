/* Room transport: PeerJS signaling + an encrypted, reliable WebRTC data channel. */
'use strict';
(function(){
  const Core=window.PaperOnlineCore,KEY='paperparty:online:v1',PREFIX='paper-party-v1-',ALPHABET='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let current=null,peerLoading=null;
  const saved=(sessionOnly=false)=>{try{const session=JSON.parse(sessionStorage.getItem(KEY));if(session)return session;if(sessionOnly)return null;const backup=JSON.parse(localStorage.getItem(KEY+':recovery'));return backup&&Date.now()-backup.savedAt<86400000?backup:null}catch{return null}};
  const nickname=()=>($('#online-name')?.value.trim()||store.get('online-name','')||'论文侦探').slice(0,12);
  function roomFrom(value){try{if(value.includes('://'))value=new URLSearchParams(new URL(value).hash.slice(1)).get('room')||''}catch{return ''}value=value.trim().toUpperCase().replace(/[\s-]/g,'');return /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/.test(value)?value:''}
  const hashRoom=()=>roomFrom(new URLSearchParams(location.hash.slice(1)).get('room')||'');
  const newCode=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),x=>ALPHABET[x%ALPHABET.length]).join('');
  function loadPeer(){if(window.Peer)return Promise.resolve();if(peerLoading)return peerLoading;peerLoading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='peerjs.min.js';const fail=()=>{clearTimeout(timer);peerLoading=null;script.remove();reject(Error('联机组件没有加载好，请联网重试。'))};const timer=setTimeout(fail,12000);script.onload=()=>{clearTimeout(timer);window.Peer?resolve():fail()};script.onerror=fail;document.head.append(script)});return peerLoading}
  function checkpoint(){if(!current)return;const value=JSON.stringify({role:current.role,room:current.room,name:current.name,token:current.token,fields:current.fields,version:current.version,snapshot:current.host?.s||null,state:current.state,secret:current.secret,closed:current.closed,savedAt:Date.now()});try{sessionStorage.setItem(KEY,value)}catch{}try{localStorage.setItem(KEY+':recovery',value)}catch{}}
  window.onlineSetup=function(){const s=saved();return `<div class="online-setup"><label class="label" for="online-name">你的昵称</label><input class="online-input" id="online-name" maxlength="12" placeholder="比如：论文侦探" value="${esc(store.get('online-name',''))}"><div class="join-row"><label class="sr-only" for="online-code">房间号或邀请链接</label><input class="online-input" id="online-code" autocomplete="off" placeholder="房间号或好友的邀请链接" value="${esc(hashRoom())}"><button class="soft" data-online="join">加入房间</button></div>${s&&!s.closed?'<button class="link" data-online="resume">回到上次的房间 →</button>':''}<p class="mode-note">想当房主？选好下方领域，再点创建房间。</p></div>`};
  function persistName(name){store.set('online-name',name)}
  async function enter(role,code,resume){
    if(current)return;
    if(navigator.onLine===false){toast('好友联机需要联网，离线时可以玩单人和同屏双人。');return}
    if(!window.RTCPeerConnection||!crypto?.subtle){toast('联机需要支持 WebRTC 的浏览器，请用新版浏览器打开。');return}
    const name=resume?.name||nickname();persistName(name);
    current={role,room:code,name,token:resume?.token||Core.random(),fields:resume?.fields||[...selected],version:'',host:null,state:resume?.state||null,secret:resume?.secret||null,draft:null,conn:null,peer:null,connected:false,closed:false,lastSeen:0,connectionStatus:'正在连线…',error:'',messageChain:Promise.resolve(),attempts:0};
    mode='online';screen='online';current.fields=current.fields.filter(f=>FIELDS.includes(f));history.replaceState(null,'',location.pathname+location.search+'#room='+code);render();
    const ctx=current;
    try{
      ctx.version=await Core.digest(JSON.stringify(BANK.map(q=>[q.id,q.tier,q.summary])));
      if(current!==ctx)return;
      if(resume?.version&&resume.version!==ctx.version)throw Error('题库更新了，请重新创建房间。');
      if(role==='host'){
        ctx.host=new Core.Room({room:code,name,fields:ctx.fields,version:ctx.version,bank:BANK,snapshot:resume?.snapshot});ctx.state=ctx.host.publicState();
        ctx.host.onChange=s=>{if(current!==ctx)return;const moved=ctx.state?.round!==s.round||ctx.state?.index!==s.index;ctx.state=s;if(moved){ctx.draft=null;if(ctx.secret&&(ctx.secret.round!==s.round||ctx.secret.index!==s.index))ctx.secret=null}checkpoint();send({type:'state',state:s});releaseIfNeeded();render()};
      }
      checkpoint();await loadPeer();if(current!==ctx)return;
      ctx.peer=new Peer(role==='host'?PREFIX+code.toLowerCase():undefined,{secure:true,debug:0,config:{iceServers:[{urls:'stun:stun.cloudflare.com:3478'},{urls:'stun:stun.l.google.com:19302'}],sdpSemantics:'unified-plan'}});
      ctx.peer.on('open',()=>{if(current!==ctx||ctx.closed)return;ctx.connectionStatus=role==='host'?'房间已开，等好友加入':'正在找房间…';ctx.error='';if(role==='guest')connectGuest();render()});
      ctx.peer.on('connection',conn=>{if(current!==ctx||role!=='host'){conn.close();return}bind(conn)});
      ctx.peer.on('disconnected',()=>{if(current!==ctx||ctx.closed)return;if(!ctx.connected){ctx.connectionStatus='连接断开，正在重连…';render()}setTimeout(()=>{if(current===ctx&&!ctx.closed&&ctx.peer.disconnected&&!ctx.peer.destroyed){try{ctx.peer.reconnect()}catch{}}},2000)});
      ctx.peer.on('error',error=>{if(current!==ctx||ctx.closed)return;ctx.error=error.type==='peer-unavailable'?'房主可能正在分享邀请，回来后会自动连接，房间号不用换。':error.type==='unavailable-id'?'正在恢复原来的房间，稍等一下会自动重试。':'暂时没有连上。双方可以换个网络，再点重连。';ctx.connectionStatus='正在等重连…';render()});
      ctx.timer=setInterval(()=>{if(current!==ctx||ctx.closed||document.hidden)return;if(ctx.peer?.destroyed){retry();return}if(ctx.peer?.disconnected){try{ctx.peer.reconnect()}catch{}}if(ctx.conn?.open){send({type:'ping'});if(ctx.lastSeen&&Date.now()-ctx.lastSeen>30000){ctx.connected=false;ctx.connectionStatus='对方暂时切走了，回来后自动接着玩';ctx.conn.close();render()}}else if(role==='guest'&&ctx.peer?.open&&!ctx.connecting)connectGuest()},4000);
      ctx.timeout=setTimeout(()=>{if(current===ctx&&!ctx.closed&&!ctx.connected&&(role==='guest'||!ctx.peer?.open)){ctx.error=role==='host'?'暂时没有连上联机服务，请检查网络或重试。':'还没收到房主回应。如果双方都在，可能是当前网络限制了直连，请换个网络重试。';render()}},22000);
    }catch(error){if(current===ctx){ctx.error=error.message||'没能建立房间，请重试。';render()}}
  }
  function send(packet){const c=current;if(c?.conn?.open){try{c.conn.send({schema:1,room:c.room,...packet});return true}catch{}}return false}
  function connectGuest(){const c=current;if(!c||c.role!=='guest'||c.closed||!c.peer?.open||c.conn?.open||c.connecting)return;c.connecting=true;c.connectionStatus='正在连接房主…';const conn=c.peer.connect(PREFIX+c.room.toLowerCase(),{reliable:true,serialization:'json'});bind(conn);setTimeout(()=>{if(current===c&&c.connecting&&!c.connected){c.connecting=false;conn.close();render()}},12000)}
  function bind(conn){const c=current;if(!c)return;let accepted=false;
    if(c.role==='guest')c.conn=conn;
    conn.on('open',()=>{if(current!==c){conn.close();return}c.lastSeen=Date.now();if(c.role==='guest'){c.connecting=false;c.conn=conn;send({type:'hello',name:c.name,token:c.token,version:c.version})}});
    conn.on('data',packet=>{if(current!==c||!packet||packet.schema!==1||packet.room!==c.room||JSON.stringify(packet).length>65536)return;
      if(c.role==='host'&&!accepted){if(packet.type!=='hello')return;const occupied=c.host.s.guestToken&&c.host.s.guestToken!==packet.token;if(occupied||!c.host.join(packet.token,packet.name,packet.version)){const full=!!occupied;conn.send({schema:1,room:c.room,type:'reject',code:full?'room-full':'version-mismatch',reason:full?'房间已满，这里已经有两位玩家啦。请换个房间，或让好友重新创建。':'两人的题库版本不同，请双方刷新网页后重开。'});setTimeout(()=>conn.close(),500);return}const previous=c.conn;accepted=true;c.conn=conn;if(previous&&previous!==conn)previous.close();c.connected=true;c.lastSeen=Date.now();c.error='';c.connectionStatus='好友已连接';send({type:'state',state:c.host.publicState()});render();return}
      if(c.role==='host'&&conn!==c.conn)return;c.lastSeen=Date.now();
      c.messageChain=c.messageChain.then(()=>receive(packet)).catch(()=>{if(current===c){c.error='刚才的消息没有处理好，正在重新同步。';send({type:'sync'});render()}});
    });
    conn.on('close',()=>{if(current!==c||c.conn!==conn)return;c.conn=null;c.connected=false;c.connecting=false;if(!c.closed){c.connectionStatus='对方暂时切走了，回来后自动接着玩';render()}});
    conn.on('error',()=>{if(current===c&&c.conn===conn){c.connected=false;c.connecting=false;c.connectionStatus='连接不稳定，正在重连…';render()}});
  }
  async function receive(packet){const c=current;if(!c||c.closed)return;
    if(packet.type==='ping'){send({type:'pong'});return}if(packet.type==='pong'){if(!c.connected){c.connected=true;c.error='';render()}return}
    if(packet.type==='reject'){c.closed=true;c.connected=false;c.connectionStatus=packet.code==='room-full'?'房间已满':'没有加入房间';c.error=String(packet.reason||'没有加入房间。');checkpoint();clearInterval(c.timer);clearTimeout(c.timeout);c.conn?.close();c.peer?.destroy();render();return}
    if(packet.type==='leave'){c.closed=true;c.connected=false;c.connectionStatus='房间已结束';c.error='对方离开了房间。想继续玩，可以重新开一间。';checkpoint();c.conn?.close();render();return}
    if(c.role==='host'){
      const h=c.host,s=h.s;
      switch(packet.type){case'commit':h.commit(1,packet.round,packet.index,packet.hash);break;case'request-reveal':h.requestReveal(packet.round,packet.index);break;case'reveal':await h.reveal(1,packet.round,packet.index,packet.vote,packet.salt);break;case'next':h.advance(1,packet.round,packet.index);break;case'rematch':h.rematch(1,pickQuestions(s.fields));break;case'sync':break;default:return}
      send({type:'state',state:h.publicState()});
    }else if(packet.type==='state'){
      const s=packet.state;if(!validState(s,c))return;if(c.state&&s.revision<c.state.revision)return;
      const changed=c.state?.round!==s.round||c.state?.index!==s.index;c.state=s;c.connected=true;c.error='';c.connectionStatus='已连接房主';
      if(changed){c.draft=null;if(c.secret&&(c.secret.round!==s.round||c.secret.index!==s.index))c.secret=null}
      checkpoint();if(c.secret&&s.commits[1]===null&&s.phase==='choose')send({type:'commit',round:s.round,index:s.index,hash:c.secret.hash});releaseIfNeeded();render();
    }
  }
  function validState(s,c){
    if(!s||s.schema!==1||s.room!==c.room||s.version!==c.version||!Number.isInteger(s.revision)||s.revision<0)return false;
    if(!Array.isArray(s.names)||s.names.length!==2||!s.names.every(n=>typeof n==='string'&&n.length<=12)||!Array.isArray(s.fields)||!s.fields.length||!s.fields.every(f=>FIELDS.includes(f)))return false;
    if(!Array.isArray(s.questions)||s.questions.length>10||new Set(s.questions).size!==s.questions.length||!s.questions.every(id=>BANK.some(q=>q.id===id)))return false;
    if(!['lobby','choose','ready','revealing','reveal','finished','closed'].includes(s.phase)||!Number.isInteger(s.index)||s.index<0||s.index>10)return false;
    if(!['lobby','closed'].includes(s.phase)&&s.questions.length!==10||s.phase==='finished'&&s.index!==10||!['finished','closed'].includes(s.phase)&&s.index===10)return false;
    if(!Array.isArray(s.commits)||s.commits.length!==2||!s.commits.every(h=>h===null||typeof h==='string'&&/^[a-f0-9]{64}$/.test(h)))return false;
    if(!Array.isArray(s.next)||s.next.length!==2||!s.next.every(n=>typeof n==='boolean')||!Array.isArray(s.history)||s.history.length>10)return false;
    if(!Array.isArray(s.points)||s.points.length!==2||!s.points.every(p=>Number.isInteger(p)&&p>=0&&p<=100))return false;
    const points=[0,0];for(let i=0;i<s.history.length;i++){const item=s.history[i];if(!item||item.id!==s.questions[i]||!Array.isArray(item.votes)||item.votes.length!==2||!item.votes.every(v=>['top','regular'].includes(v)))return false;const q=BANK.find(q=>q.id===item.id);item.votes.forEach((vote,p)=>{if(vote===q.tier)points[p]+=10})}
    if(points.some((n,p)=>n!==s.points[p]))return false;
    return s.phase==='closed'||s.history.length===(s.phase==='reveal'?s.index+1:s.index);
  }
  function pickQuestions(fields){const pool=BANK.filter(q=>fields.includes(q.field)),seen=new Set(store.get('seen',[]));let fresh=pool.filter(q=>!seen.has(q.id));if(fresh.length<10)fresh=pool;const n=4+Math.floor(Math.random()*3);let result=[...shuffle(fresh.filter(q=>q.tier==='top')).slice(0,n),...shuffle(fresh.filter(q=>q.tier==='regular')).slice(0,10-n)];if(result.length<10){const used=new Set(result.map(q=>q.id));result.push(...shuffle(fresh.filter(q=>!used.has(q.id))).slice(0,10-result.length))}result=shuffle(result);result.forEach(q=>seen.add(q.id));store.set('seen',[...seen]);return result.map(q=>q.id)}
  async function lockVote(){const c=current,s=c?.state,p=c?.role==='host'?0:1;if(!s||!c.connected||s.phase!=='choose'||s.commits[p]||!c.draft||c.locking)return;c.locking=true;const round=s.round,index=s.index;try{const salt=Core.random(),vote=c.draft,hash=await Core.commitment(round,index,p,vote,salt);if(current!==c||c.state.round!==round||c.state.index!==index)return;c.secret={round,index,vote,salt,hash};checkpoint();if(p===0)c.host.commit(0,round,index,hash);else send({type:'commit',round,index,hash});}finally{c.locking=false;render()}}
  function releaseIfNeeded(){const c=current,s=c?.state,v=c?.secret,p=c?.role==='host'?0:1;if(!s||s.phase!=='revealing'||!v||v.round!==s.round||v.index!==s.index)return;if(c.releasing)return;c.releasing=true;const finish=()=>{if(current===c)c.releasing=false};if(p===0)c.host.reveal(0,s.round,s.index,v.vote,v.salt).finally(finish);else{send({type:'reveal',round:s.round,index:s.index,vote:v.vote,salt:v.salt});finish()}}
  const connection=()=>`<span class="online-presence ${current.connected?'live':''}"><i></i>${esc(current.connectionStatus)}</span>`;
  function render(){const c=current;if(!c)return;screen='online';const s=c.state,p=c.role==='host'?0:1;let body='';const head=`<div class="game-top"><button class="back" data-online="leave-prompt">← 离开房间</button>${connection()}</div>`;
    if(c.closed){body=`<section class="privacy-card"><div class="emoji">🍓</div><h2>${c.connectionStatus==='房间已满'?'房间已满':'这间房先收好'}</h2><p>${esc(c.error)}</p><button class="primary" data-online="leave">回去重新开一间 →</button></section>`}
    else if(!s||s.phase==='lobby'){
      body=`<section class="qcard"><div class="qhead"><span class="tag">好友联机</span><span>每局 10 题</span></div><div class="qbody"><h2>${c.role==='host'?'房间开好了，叫上好友':'来，和好友猜一局'}</h2><p>${c.role==='host'?'点「分享给好友」发送邀请。切去发消息也没关系，回来后会自动恢复原房间。':'等房主准备好，就可以一起开猜。'}</p><div class="room-code">${esc(c.room.slice(0,4))} ${esc(c.room.slice(4,8))} ${esc(c.room.slice(8))}</div><div class="online-actions"><button class="primary" data-online="share">分享给好友 ↗</button><button class="soft" data-online="copy-link">复制邀请链接 ↗</button><button class="soft" data-online="copy-code">复制房间号</button></div><div class="room-players"><div>🍓 ${esc(s?.names[0]|| (c.role==='host'?c.name:'房主'))}<span>房主</span></div><div>🍋 ${esc(c.connected?(s?.names[1]||'好友'):'等好友加入')}<span>${c.connected?'已就位':'还没到'}</span></div></div>${s?`<div class="methods">${s.fields.map(f=>`<span>${esc(f)}</span>`).join('')}</div>`:''}${c.role==='host'?`<button class="primary confirm" data-online="start" ${!c.connected?'disabled':''}>一起开始，猜 10 题 ↗</button>`:'<p class="turn">等房主开始，不用抢答。</p>'}</div></section>`;
    }else if(s.phase==='finished'){
      const title=s.points[0]===s.points[1]?'平局！下局再比。':`${esc(s.names[s.points[0]>s.points[1]?0:1])} 赢啦！`;
      body=`<div class="result-title"><div class="emoji">✌️</div><h2>${title}</h2><p>这一局，十题都猜完了。</p></div><div class="scorecards">${s.names.map((name,i)=>`<div class="scorecard"><p>${esc(name)}${i===p?'（你）':''}</p><strong>${s.points[i]}</strong><p>猜对 ${s.points[i]/10} 题</p></div>`).join('')}</div><div class="result-actions"><button class="primary" data-online="rematch" ${s.next[p]||!c.connected?'disabled':''}>${s.next[p]?'等好友也准备好':'再比一局 ↗'}</button><button class="soft" data-online="leave-prompt">回首页</button></div><h3 class="section-title">这局都猜了什么</h3><div class="review-list">${s.history.map((item,i)=>{const q=BANK.find(q=>q.id===item.id);return `<details class="review-item"><summary><span class="rmark ${item.votes[p]!==q.tier?'bad':''}">${item.votes[p]===q.tier?'✓':'×'}</span><span class="rfield">${i+1} · ${esc(q.field)}</span><span>${tierLabel(q.tier)} ＋</span></summary><div class="rbody"><p>${q.summary.map(esc).join('')}</p><p>${esc(q.title)}</p><p>${esc(q.venue)} · ${q.year}</p><p>${s.names.map((name,j)=>`${esc(name)}：${tierLabel(item.votes[j])} ${item.votes[j]===q.tier?'✓':'×'}`).join('　')}</p><a href="${esc(safeUrl(q.url))}" target="_blank" rel="noopener noreferrer">查看论文与摘要 ↗</a></div></details>`}).join('')}</div>`;
    }else{
      const q=BANK.find(q=>q.id===s.questions[s.index]);if(!q)return;
      body=`<div class="online-scores">${s.names.map((name,i)=>`<span>${esc(name)}${i===p?'（你）':''} <strong>${s.points[i]}</strong> 分</span>`).join('')}</div><div class="progress"><i style="width:${(s.index+1)*10}%"></i></div><article class="qcard"><div class="qhead"><span class="tag">${esc(q.field)}</span><span>第 ${String(s.index+1).padStart(2,'0')} / 10 题</span></div><div class="qbody"><h2>你觉得，这篇发在哪？</h2><div class="summary">${q.summary.map((sentence,i)=>`<div class="sentence"><span>0${i+1}</span><p>${esc(sentence)}</p></div>`).join('')}</div><div class="methods">${q.methods.map(method=>`<span>${esc(method)}</span>`).join('')}</div></div></article>`;
      if(s.phase==='reveal'){
        const item=s.history[s.index];body+=`<section class="reveal"><h3>答案来了！${tierLabel(q.tier)}</h3><div class="vote-result">${s.names.map((name,i)=>`<span>${esc(name)}：${item.votes[i]===q.tier?'猜中 +10':'没猜中 +0'}</span>`).join('')}</div><p class="paper-title">${esc(q.title)}</p><p class="venue">${esc(q.venue)} · ${q.year}</p><a class="source" href="${esc(safeUrl(q.url))}" target="_blank" rel="noopener noreferrer">查看论文与摘要 ↗</a></section><button class="primary confirm" data-online="next" ${s.next[p]||!c.connected?'disabled':''}>${s.next[p]?'等好友看完答案':s.index===9?'看看这一局的成绩':'准备好了，下一题 →'}</button>`;
      }else if(s.phase==='ready')body+='<p class="turn">两个人都锁定了，看看谁猜中！</p><button class="primary confirm" data-online="reveal" '+(!c.connected?'disabled':'')+'>确认，一起揭晓 ↗</button>';
      else if(s.phase==='revealing')body+='<p class="turn" role="status">正在一起打开答案…</p><button class="soft confirm" data-online="sync">重新同步</button>';
      else if(s.commits[p]||c.secret&&c.secret.round===s.round&&c.secret.index===s.index)body+='<div class="locked-choice"><h3>你的选择已锁定 ✓</h3><p>等好友选好，我们一起揭晓。</p></div>';
      else body+=`<p class="turn">${s.commits[1-p]?'好友已锁定，慢慢想，不着急。':'同一题，各自猜。'}</p><div class="choices"><button class="choice ${c.draft==='top'?'selected':''}" aria-pressed="${c.draft==='top'}" data-online="vote" data-value="top">✷ 顶会 / 顶刊</button><button class="choice ${c.draft==='regular'?'selected':''}" aria-pressed="${c.draft==='regular'}" data-online="vote" data-value="regular">▤ 普通期刊</button></div><button class="primary confirm" data-online="lock" ${!c.draft||!c.connected||c.locking?'disabled':''}>锁定我的选择 ↗</button><p class="selection-note">锁定后不能更改，好友暂时看不到你的选择。</p>`;
    }
    if(c.error&&!c.closed)body+=`<div class="connection-error" role="status"><p>${esc(c.error)}</p><button class="soft" data-online="retry">重新连接</button></div>`;
    layout(`<div class="game online-game">${head}${body}<p class="online-room-label">房间 ${esc(c.room)}</p></div>`);
  }
  function leavePrompt(target='home'){if(current?.closed){leave(target);return}modal('要离开这个房间吗？','<p>离开后，好友会收到提示。这局不会自动算输赢。</p><button class="primary" data-online="leave" data-target="'+(target==='library'?'library':'home')+'">离开房间</button>')}
  function leave(target='home'){const c=current;if(c){send({type:'leave'});c.closed=true;checkpoint();clearInterval(c.timer);clearTimeout(c.timeout);setTimeout(()=>{c.conn?.close();c.peer?.destroy()},200);current=null}history.replaceState(null,'',location.pathname+location.search);$('#modal')?.close();mode='solo';target==='library'?library():home();window.scrollTo(0,0)}
  function retry(){const c=current;if(!c||c.closed)return;c.error='';if(!c.peer||c.peer.destroyed){checkpoint();const resume=saved();clearInterval(c.timer);clearTimeout(c.timeout);current=null;if(resume&&!resume.closed)enter(resume.role,resume.room,resume);return}if(c.peer.disconnected){try{c.peer.reconnect()}catch{}}if(c.role==='guest'){c.connecting=false;c.conn?.close();connectGuest()}else send({type:'state',state:c.host.publicState()});render()}
  const inviteUrl=c=>location.origin+location.pathname+'#room='+c.room;
  async function copyInvite(value,isCode=false){try{await navigator.clipboard.writeText(value);toast(isCode?'房间号已复制，切去发送后再回来就好。':'邀请链接已复制，切去发送后再回来就好。')}catch{modal('把这个发给好友',`<input class="online-input" readonly value="${esc(value)}" aria-label="邀请信息"><p>长按或选中后复制，发完回来就能接着玩。</p>`)}}
  async function shareInvite(){const c=current;if(!c||c.sharing)return;c.sharing=true;checkpoint();try{if(navigator.share)await navigator.share({title:'这也能发？',text:'来猜猜这些论文发在哪！打开链接，点加入房间。',url:inviteUrl(c)});else await copyInvite(inviteUrl(c))}catch(error){if(error.name!=='AbortError')await copyInvite(inviteUrl(c))}finally{c.sharing=false;if(current===c)wake()}}
  function wake(){const c=current;if(!c||c.closed||document.hidden)return;c.lastSeen=Date.now();if(!c.peer)return;if(c.peer.destroyed||c.peer.disconnected||!c.conn?.open){retry();return}send({type:'ping'});if(c.role==='host')send({type:'state',state:c.host.publicState()});else send({type:'sync'});releaseIfNeeded()}
  document.addEventListener('click',async event=>{const button=event.target.closest('[data-online]');if(!button||button.disabled)return;const action=button.dataset.online;
    if(action==='join'){const room=roomFrom($('#online-code')?.value||'');if(!room){toast('粘贴邀请链接，或填入 12 位房间号。');return}const prior=saved(true);await enter('guest',room,prior?.role==='guest'&&prior.room===room&&!prior.closed?prior:null);return}
    if(action==='resume'){const prior=saved();if(prior&&!prior.closed)await enter(prior.role,prior.room,prior);return}
    if(action==='leave-prompt'){leavePrompt();return}if(action==='leave'){leave(button.dataset.target);return}if(action==='retry'){retry();return}
    const c=current;if(!c)return;const s=c.state,p=c.role==='host'?0:1;
    if(action==='share'){await shareInvite();return}
    if(action==='copy-link'||action==='copy-code'){checkpoint();await copyInvite(action==='copy-code'?c.room:inviteUrl(c),action==='copy-code');return}
    if(!s||!c.connected)return;
    switch(action){case'start':if(p===0)c.host.start(pickQuestions(s.fields));break;case'vote':if(s.phase==='choose'&&!s.commits[p]){c.draft=button.dataset.value;render()}break;case'lock':await lockVote();break;case'reveal':if(p===0)c.host.requestReveal(s.round,s.index);else send({type:'request-reveal',round:s.round,index:s.index});break;case'next':if(p===0)c.host.advance(0,s.round,s.index);else send({type:'next',round:s.round,index:s.index});break;case'rematch':if(p===0)c.host.rematch(0,pickQuestions(s.fields));else send({type:'rematch'});break;case'sync':if(p===0){send({type:'state',state:c.host.publicState()});releaseIfNeeded()}else send({type:'sync'});break}
  });
  window.addEventListener('online',()=>{if(current)retry()});
  document.addEventListener('change',event=>{if(event.target.id==='online-name')persistName(event.target.value.trim().slice(0,12))});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)checkpoint();else wake()});
  window.addEventListener('pagehide',checkpoint);
  window.addEventListener('pageshow',wake);
  window.addEventListener('focus',wake);
  document.addEventListener('freeze',checkpoint);
  document.addEventListener('resume',wake);
  window.PaperOnline={get active(){return !!current},open(){enter('host',newCode())},leavePrompt};
  if(hashRoom())mode='online';home();
  // Only this tab's saved session may resume automatically; an invitation in a
  // different tab must still join as a guest rather than take over the host.
  try{const prior=JSON.parse(sessionStorage.getItem(KEY));if(prior&&!prior.closed&&prior.room===hashRoom())enter(prior.role,prior.room,prior)}catch{}
})();




