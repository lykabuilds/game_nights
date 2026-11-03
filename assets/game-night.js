/* Game Night: QR sharing, quick players, room codes, live scores, leaderboard. */
/* Backend bridge: resolves once Firebase is connected (or null if not configured). */
window.backend=(()=>{let res;const p=new Promise(r=>res=r);
  if(window.__mockBackend)res(window.__mockBackend);
  setTimeout(()=>res(null),15000);
  return{use:n=>p.then(x=>x?(x[n]||null):null),_resolve:res}})();
(function(){
const APP_URL=location.origin+location.pathname;const ROOT_URL=new URL(document.documentElement.dataset.root||'./',location.href).href;
const GAMES={harmonies:{name:'Harmonies',icon:'🌿',min:1,max:4,tb:'Animal cubes',mode:'score'},
  century:{name:'Century: Golem Edition',icon:'💎',min:2,max:5,tb:null,mode:'score'},
  ted:{name:'Tiny Epic Dungeons',icon:'🗡️',min:2,max:4,tb:null,mode:'coop'}};
const EMOJIS=['🦊','🐸','🐼','🦄','🐙','🐢','🦎','🐝','🐧','🦉','🐱','🐶','🐰','🐯','🐨','🍄','🌸','⭐','🌈','🍙','🍡','🎸','🚀','👾'];
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let db=null,user=null,myId=null,canWrite=null,me=null,players={},room=null,roomCode=null,unsubRoom=null,newGame='harmonies',lbGame='all',results=[];
const qWrite={};function queued(key,fn){const p=(qWrite[key]||Promise.resolve()).then(fn,fn);qWrite[key]=p.catch(()=>{});return p}
function onWriteErr(e){if(e&&e.code==='denied'){status('That change isn\'t allowed. Only the host can manage this room.')}else if(e&&e.code==='quota_exceeded'){status('The game database is full. Delete some old games to make room.')}else{status('Couldn\'t save just now. Please try again.')}}
function status(t){const s=$('p-status');if(!t){s.classList.add('hidden');return}s.textContent=t;s.classList.remove('hidden')}

/* ---------- QR ---------- */
function drawQR(el,text){el.innerHTML='';try{if(typeof QRCode==='undefined')throw 0;new QRCode(el,{text,width:320,height:320,colorDark:'#3b3350',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M})}catch(e){el.innerHTML='<div class="qrfail">QR code couldn\'t load.<br>Use the link instead.</div>'}}
function setShare(code){const url=code?APP_URL+'#room-'+code:ROOT_URL;$('qr-link').textContent=url;$('qr-title').textContent=code?'Scan to join room '+code:'Scan to open the rulebook';$('qr-sub').textContent=code?'Opens this page straight into the room.':'Point a phone camera at the code.';drawQR($('qr-app'),url)}
$('qr-copy').addEventListener('click',async()=>{const t=$('qr-link').textContent;try{await navigator.clipboard.writeText(t);$('qr-copy').textContent='Copied! ✓'}catch(e){const r=document.createRange();r.selectNodeContents($('qr-link'));const s=getSelection();s.removeAllRanges();s.addRange(r);$('qr-copy').textContent='Selected, press copy'}setTimeout(()=>$('qr-copy').textContent='Copy link',1800)});

/* ---------- my player ---------- */
let pickEmoji=EMOJIS[0];
EMOJIS.forEach(e=>{const b=document.createElement('button');b.textContent=e;b.setAttribute('aria-pressed',e===pickEmoji);b.onclick=()=>{pickEmoji=e;[...$('me-emoji').children].forEach(x=>x.setAttribute('aria-pressed',x===b))};$('me-emoji').append(b)});
function renderMe(){
  const v=$('me-view'),f=$('me-form');
  if(!db){v.innerHTML='<div class="empty">'+(window.backendError==='config'?'Game Night isn\'t connected yet. Add your Firebase settings (see README).':'Connecting to Game Night… The rules and calculators work offline.')+'</div>';f.classList.add('hidden');return}
  if(me&&!f.dataset.editing){v.innerHTML='<div class="me"><div class="avatar">'+esc(me.emoji)+'</div><div><div class="name">'+esc(me.name)+'</div><div class="hint">That\'s you! '+(stats(myId).games?stats(myId).games+' games · '+stats(myId).wins+' wins':'No games yet')+'</div></div><span style="flex:1"></span>'+(canWrite!==false?'<button class="btn" id="me-edit">Edit</button>':'')+'</div>';f.classList.add('hidden');const b=$('me-edit');if(b)b.onclick=()=>{f.dataset.editing='1';$('me-name').value=me.name;pickEmoji=me.emoji;[...$('me-emoji').children].forEach(x=>x.setAttribute('aria-pressed',x.textContent===me.emoji));renderMe()};return}
  if(canWrite===false){v.innerHTML='<div class="empty">Couldn\'t save right now. The host can still add you to a room by name.</div>';f.classList.add('hidden');return}
  v.innerHTML=me?'':'<p class="hint" style="margin:0 0 10px">Make a quick player so you can join rooms and show up on the leaderboard.</p>';f.classList.remove('hidden');
}
$('me-save').addEventListener('click',()=>{const name=$('me-name').value.trim().slice(0,18);if(!name){$('me-name').focus();return}
  const data={name,emoji:pickEmoji,uid:myId,createdAt:me?.createdAt||Date.now()};
  queued('players/'+myId,()=>db.doc('players/'+myId).set(data)).then(()=>{delete $('me-form').dataset.editing;me=data;players[myId]=data;renderMe();renderRoom()},onWriteErr)});

/* ---------- rooms ---------- */
pillsP($('new-game'),v=>newGame=v);pillsP($('lb-filter'),v=>{lbGame=v;renderBoard()});
function pillsP(el,cb){el.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{el.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed','false'));b.setAttribute('aria-pressed','true');cb(b.dataset.v)}))}
const CH='ABCDEFGHJKMNPQRSTUVWXYZ';const mkCode=()=>Array.from({length:4},()=>CH[Math.floor(Math.random()*CH.length)]).join('');
$('room-create').addEventListener('click',async()=>{
  if(!db)return status('Game Night isn\'t connected yet. Check your internet connection.');if(canWrite===false)return status('View-only access can\'t create rooms.');
  if(!me){status('Make your player first (step 2), then create a room.');$('p-me').scrollIntoView({behavior:'smooth'});return}
  status('');let code;let free=false;for(let i=0;i<10;i++){code=mkCode();const s=await db.doc('rooms/'+code).get().catch(()=>null);if(s&&!s.exists){free=true;break}}if(!free)return status('Couldn\'t get a free room code. Try again.');
  const data={game:newGame,host:myId,status:'lobby',createdAt:Date.now(),members:{[myId]:{joinedAt:Date.now()}},scores:{},outcome:null};
  queued('rooms/'+code,()=>db.doc('rooms/'+code).set(data)).then(()=>openRoom(code),onWriteErr)});
$('join-code').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z]/g,'')});
$('room-join').addEventListener('click',()=>{const c=$('join-code').value.trim().toUpperCase();if(c.length!==4){$('join-msg').innerHTML='<div class="warn">Codes are 4 letters.</div>';return}openRoom(c,true)});
function openRoom(code,joining){
  if(!db){status('Game Night isn\'t connected yet. Check your internet connection.');return}
  if(unsubRoom)unsubRoom();roomCode=code;room=null;$('join-msg').innerHTML='';
  try{history.replaceState(null,'','#room-'+code)}catch(e){}
  $('room-lobby').classList.add('hidden');const v=$('room-view');v.classList.remove('hidden');v.innerHTML='<div class="card empty">Finding room '+esc(code)+'…</div>';
  setShare(code);
  let t=setTimeout(()=>{if(!room)v.innerHTML='<div class="card empty">Can\'t reach the room yet. Check your connection.<br><br><button class="btn" id="room-leave2">Back</button></div>';const b=$('room-leave2');if(b)b.onclick=leaveRoom},10000);
  let first=true;
  unsubRoom=db.doc('rooms/'+code).onSnapshot(s=>{
    if(!s.metadata.fromCache)clearTimeout(t);
    if(!s.exists){if(!s.metadata.fromCache){clearTimeout(t);leaveRoom();$('join-msg').innerHTML='<div class="warn">No room with code '+esc(code)+'. Double-check it with the host.</div>'}return}
    room=s.data();
    if(first&&joining&&myId&&me&&canWrite!==false&&!(room.members||{})[myId]&&room.status!=='done'){first=false;addMember(myId)}
    first=false;renderRoom()},e=>{clearTimeout(t);v.innerHTML='<div class="card empty">Lost the connection to this room.</div>'});
}
function leaveRoom(){if(unsubRoom)unsubRoom();unsubRoom=null;room=null;roomCode=null;$('room-view').classList.add('hidden');$('room-lobby').classList.remove('hidden');setShare(null);try{history.replaceState(null,'',location.pathname)}catch(e){}}
function addMember(pid){const g=GAMES[room.game];if(Object.keys(room.members||{}).length>=g.max){status(g.name+' takes at most '+g.max+' players.');return}
  return queued('rooms/'+roomCode,()=>db.doc('rooms/'+roomCode).update({members:{[pid]:{joinedAt:Date.now()}}})).catch(onWriteErr)}
function removeMember(pid){const m={...room.members};delete m[pid];const sc={...(room.scores||{})};delete sc[pid];
  queued('rooms/'+roomCode,()=>db.doc('rooms/'+roomCode).set({...room,members:m,scores:sc})).catch(onWriteErr)}
function seatOrder(){return Object.entries(room.members||{}).sort((a,b)=>a[1].joinedAt-b[1].joinedAt).map(e=>e[0])}
function ranked(){const g=GAMES[room.game];const seats=seatOrder();const sc=room.scores||{};
  const rows=seats.map((pid,i)=>({pid,seat:i+1,score:+(sc[pid]?.score)||0,tb:+(sc[pid]?.tb)||0}));
  rows.sort((a,b)=>b.score-a.score||(room.game==='harmonies'?b.tb-a.tb:0)||(room.game==='century'?b.seat-a.seat:0));
  let rank=0,prev=null;rows.forEach((r,i)=>{const key=room.game==='century'?r.score+'|'+r.seat:r.score+'|'+(room.game==='harmonies'?r.tb:'');if(key!==prev){rank=i+1;prev=key}r.rank=rank});return rows}
const pName=pid=>players[pid]?.name||'Player';const pEmoji=pid=>players[pid]?.emoji||'🙂';
const isHost=()=>room&&room.host===myId;const editable=pid=>canWrite!==false&&room.status!=='done'&&(isHost()||pid===myId);
const timers={};
function setScore(pid,field,val){clearTimeout(timers[pid+field]);timers[pid+field]=setTimeout(()=>{const cur=(room.scores||{})[pid]||{};const n=Math.max(0,parseInt(val)||0);if(cur[field]===n)return;
  queued('rooms/'+roomCode,()=>db.doc('rooms/'+roomCode).update({scores:{[pid]:{[field]:n}}})).catch(onWriteErr)},500)}
function renderRoom(){
  const v=$('room-view');if(!room||!roomCode)return;const g=GAMES[room.game];const seats=seatOrder();const n=seats.length;
  const focus=document.activeElement&&v.contains(document.activeElement)?document.activeElement.dataset.key:null;
  let h='<div class="card"><div class="roomhead"><div><div class="hint">'+g.icon+' '+esc(g.name)+' · Room code</div><div class="bigcode">'+esc(roomCode)+'</div>'+
    '<div style="margin-top:8px"><span class="status-pill st-'+room.status+'">'+({lobby:'Waiting for players',playing:'Game on!',done:'Finished'})[room.status]+'</span> <span class="hint">'+n+' / '+g.max+' players'+(isHost()?' · you\'re the host':' · host: '+esc(pName(room.host)))+'</span></div></div><div class="qrbox" id="qr-room"></div></div>';
  h+='<div class="plist">';
  if(g.mode==='score'){
    const rows=room.status==='lobby'?seats.map((pid,i)=>({pid,seat:i+1})):ranked();
    rows.forEach(r=>{const sc=(room.scores||{})[r.pid]||{};const ed=editable(r.pid)&&room.status==='playing';
      const medal=room.status==='lobby'?'#'+r.seat:(r.rank===1?'🥇':r.rank===2?'🥈':r.rank===3?'🥉':r.rank);
      h+='<div class="pl'+(room.status!=='lobby'&&r.rank===1&&(sc.score||0)>0?' first':'')+'"><div class="rank">'+medal+'</div><div class="avatar sm">'+esc(pEmoji(r.pid))+'</div><div><div class="pname">'+esc(pName(r.pid))+(r.pid===myId?' (you)':'')+'</div><div class="pmeta">Seat '+(seats.indexOf(r.pid)+1)+(g.tb&&room.status!=='lobby'?' · '+g.tb+': '+(sc.tb||0):'')+'</div></div><div class="scorebox">';
      if(ed){h+='<input type="number" min="0" inputmode="numeric" data-key="s-'+r.pid+'" data-pid="'+r.pid+'" data-f="score" value="'+(sc.score||0)+'" aria-label="Score">'+(g.tb?'<input class="tb" type="number" min="0" inputmode="numeric" data-key="t-'+r.pid+'" data-pid="'+r.pid+'" data-f="tb" value="'+(sc.tb||0)+'" title="'+g.tb+'" aria-label="'+g.tb+'">':'')}
      else if(room.status!=='lobby')h+='<span class="big">'+(sc.score||0)+'</span>';
      if(room.status==='lobby'&&isHost()&&r.pid!==myId)h+='<button class="x" data-rm="'+r.pid+'" title="Remove">✕</button>';
      h+='</div></div>'});
    if(room.status==='playing'&&g.tb)h+='<p class="hint" style="margin:2px 4px">Second box = '+g.tb.toLowerCase()+' (tie-breaker).</p>';
    if(room.status!=='lobby'&&room.game==='century')h+='<p class="hint" style="margin:2px 4px">Ties go to the player later in turn order (seat).</p>';
  }else{
    seats.forEach((pid,i)=>{h+='<div class="pl"><div class="rank">#'+(i+1)+'</div><div class="avatar sm">'+esc(pEmoji(pid))+'</div><div><div class="pname">'+esc(pName(pid))+(pid===myId?' (you)':'')+'</div><div class="pmeta">Hero '+(i+1)+'</div></div><div class="scorebox">'+(room.status==='lobby'&&isHost()&&pid!==myId?'<button class="x" data-rm="'+pid+'">✕</button>':'')+'</div></div>'});
    if(room.status!=='lobby'){h+='<div class="outcome"><button class="win" data-out="win" aria-pressed="'+(room.outcome==='win')+'">🏆 Boss defeated!</button><button class="lose" data-out="lose" aria-pressed="'+(room.outcome==='lose')+'">💀 The dungeon won</button></div>'}
  }
  if(!n)h+='<div class="empty">No players yet.</div>';
  h+='</div>';
  if(room.status==='lobby'&&canWrite!==false){
    if(isHost()){const others=Object.entries(players).filter(([id])=>!(room.members||{})[id]);
      h+='<div class="addrow">'+(others.length?'<select class="txt" id="add-existing"><option value="">Add a saved player…</option>'+others.map(([id,p])=>'<option value="'+esc(id)+'">'+esc(p.emoji+' '+p.name)+'</option>').join('')+'</select>':'')+'<input class="txt" id="add-name" maxlength="18" placeholder="…or quick-add a name"><button class="btn" id="add-btn">+ Add</button></div><p class="hint" style="margin:6px 2px 0">Add friends who don\'t have the app. They\'ll still get a spot on the leaderboard.</p>'}
    else if(myId&&!(room.members||{})[myId]&&me)h+='<div class="roomactions"><button class="btn primary" id="join-me">Join as '+esc(me.emoji+' '+me.name)+'</button></div>';
  }
  h+='<div class="roomactions"><button class="btn" id="room-leave">Leave room view</button>';
  if(isHost()&&canWrite!==false){
    if(room.status==='lobby')h+='<button class="btn primary" id="room-start"'+(n<g.min?' disabled style="opacity:.5"':'')+'>Start game ('+(n<g.min?'need '+g.min+'+':'go!')+')</button>';
    if(room.status==='playing')h+='<button class="btn" id="room-back">Back to lobby</button><button class="btn primary" id="room-finish">Finish & save results</button>';
  }
  h+='</div>';
  if(room.status==='lobby'&&n<3)h+='<p class="hint" style="text-align:right;margin:6px 0 0">Tip: share the room QR so more players can join.</p>';
  h+='</div>';
  v.innerHTML=h;drawQR($('qr-room'),APP_URL+'#room-'+roomCode);
  v.querySelectorAll('input[data-pid]').forEach(i=>i.addEventListener('input',()=>setScore(i.dataset.pid,i.dataset.f,i.value)));
  if(focus){const el=v.querySelector('[data-key="'+focus+'"]');if(el){el.focus();try{el.select()}catch(e){}}}
  v.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>removeMember(b.dataset.rm));
  v.querySelectorAll('[data-out]').forEach(b=>b.onclick=()=>{if(canWrite===false||room.status==='done'||!(room.members||{})[myId]&&!isHost())return;queued('rooms/'+roomCode,()=>db.doc('rooms/'+roomCode).update({outcome:b.dataset.out})).catch(onWriteErr)});
  const on=(id,fn)=>{const el=$(id);if(el)el.onclick=fn};
  on('room-leave',leaveRoom);
  on('join-me',()=>addMember(myId));
  on('add-btn',async()=>{const sel=$('add-existing'),nm=$('add-name').value.trim().slice(0,18);
    if(sel&&sel.value){addMember(sel.value);return}
    if(!nm)return;const ref=db.collection('players').doc();const data={name:nm,emoji:EMOJIS[Math.floor(Math.random()*EMOJIS.length)],uid:null,createdAt:Date.now(),addedBy:myId};
    try{await ref.set(data);players[ref.id]=data;await addMember(ref.id)}catch(e){onWriteErr(e)}});
  on('room-start',()=>{if(n<g.min)return;queued('rooms/'+roomCode,()=>db.doc('rooms/'+roomCode).update({status:'playing'})).catch(onWriteErr)});
  on('room-back',()=>queued('rooms/'+roomCode,()=>db.doc('rooms/'+roomCode).update({status:'lobby'})).catch(onWriteErr));
  on('room-finish',finishGame);
}
async function finishGame(){
  const g=GAMES[room.game];let doc={game:room.game,code:roomCode,finishedAt:Date.now(),host:myId};
  if(g.mode==='coop'){if(!room.outcome){status('Pick the outcome first: did you beat the boss?');return}
    doc.coop=room.outcome;doc.standings=seatOrder().map((pid,i)=>({pid,name:pName(pid),emoji:pEmoji(pid),seat:i+1,win:room.outcome==='win'}))}
  else doc.standings=ranked().map(r=>({pid:r.pid,name:pName(r.pid),emoji:pEmoji(r.pid),seat:r.seat,score:r.score,tb:r.tb,rank:r.rank,win:r.rank===1}));
  try{const ref=await db.collection('results').add(doc);await queued('rooms/'+roomCode,()=>db.doc('rooms/'+roomCode).update({status:'done',resultId:ref.id}));status('');if(g.mode!=='coop'||room.outcome==='win')confetti()}catch(e){onWriteErr(e)}
}
function confetti(){const c=document.createElement('div');c.className='confetti';const cols=['#4cb27f','#ff8a5c','#9b7bea','#f5c542','#5fb4f0','#ff7aa8'];
  for(let i=0;i<70;i++){const p=document.createElement('i');p.style.left=Math.random()*100+'%';p.style.background=cols[i%cols.length];p.style.animationDelay=Math.random()*.6+'s';p.style.transform='rotate('+Math.random()*360+'deg)';c.append(p)}
  document.body.append(c);setTimeout(()=>c.remove(),2800)}

/* ---------- leaderboard ---------- */
function stats(pid){let games=0,wins=0;results.forEach(r=>(r.standings||[]).forEach(s=>{if(s.pid===pid){games++;if(s.win)wins++}}));return{games,wins}}
function renderBoard(){
  const lb=$('lb'),rc=$('recent');
  if(!db){lb.innerHTML='<div class="empty">The leaderboard appears once Game Night is connected.</div>';rc.innerHTML='';return}
  const list=results.filter(r=>lbGame==='all'||r.game===lbGame);const agg={};
  list.forEach(r=>(r.standings||[]).forEach(s=>{const a=agg[s.pid]||(agg[s.pid]={pid:s.pid,name:s.name,emoji:s.emoji,games:0,wins:0,best:null,total:0,scored:0});
    a.games++;if(s.win)a.wins++;if(typeof s.score==='number'){a.total+=s.score;a.scored++;a.best=Math.max(a.best??0,s.score)}}));
  const rows=Object.values(agg).map(a=>({...a,name:players[a.pid]?.name||a.name,emoji:players[a.pid]?.emoji||a.emoji,rate:a.games?a.wins/a.games:0}));
  rows.sort((a,b)=>b.wins-a.wins||b.rate-a.rate||(b.best??0)-(a.best??0));
  if(!rows.length)lb.innerHTML='<div class="empty">No finished games yet. Host a room and hit “Finish & save results” to start the leaderboard! 🏁</div>';
  else lb.innerHTML='<table class="lbtable"><thead><tr><th></th><th>Player</th><th class="num">Wins</th><th class="num">Games</th><th class="num">Win %</th>'+(lbGame==='ted'?'':'<th class="num">Best</th><th class="num">Avg</th>')+'</tr></thead><tbody>'+
    rows.map((r,i)=>'<tr><td class="medal">'+(i===0?'🥇':i===1?'🥈':i===2?'🥉':'<span class="hint">'+(i+1)+'</span>')+'</td><td><b>'+esc(r.emoji)+' '+esc(r.name)+'</b>'+(r.pid===myId?' <span class="hint">(you)</span>':'')+'</td><td class="num"><b>'+r.wins+'</b></td><td class="num">'+r.games+'</td><td class="num">'+Math.round(r.rate*100)+'%</td>'+(lbGame==='ted'?'':'<td class="num">'+(r.best??'–')+'</td><td class="num">'+(r.scored?Math.round(r.total/r.scored):'–')+'</td>')+'</tr>').join('')+'</tbody></table>'+(lbGame==='all'?'<p class="hint" style="margin:8px 0 0">In Tiny Epic Dungeons, every hero shares the win when the boss falls.</p>':'');
  rc.innerHTML=list.slice(0,8).map(r=>{const g=GAMES[r.game]||{icon:'🎲',name:r.game};const d=new Date(r.finishedAt);
    const who=r.coop?(r.coop==='win'?'🏆 Heroes won: ':'💀 Dungeon won vs ')+(r.standings||[]).map(s=>esc(s.emoji+' '+s.name)).join(', '):(r.standings||[]).filter(s=>s.rank===1).map(s=>'🥇 '+esc(s.emoji+' '+s.name)+' ('+s.score+')').join(', ');
    return '<div class="recent-item"><span>'+g.icon+' '+esc(g.name)+' · <span class="hint">'+d.toLocaleDateString(undefined,{month:'short',day:'numeric'})+'</span></span><span>'+who+'</span></div>'}).join('')||'<div class="empty">Nothing yet.</div>';
}
function renderAll(){renderMe();renderBoard();if(room)renderRoom()}

/* ---------- boot ---------- */
setShare(null);renderMe();renderBoard();
function hashRoom(){const m=location.hash.match(/^#room-([A-Za-z]{4})$/);return m?m[1].toUpperCase():null}
window.addEventListener('hashchange',()=>{const c=hashRoom();if(c&&c!==roomCode){if(db)openRoom(c,true)}});
(async()=>{
  [db,user]=await Promise.all([backend.use('db'),backend.use('user')]);
  if(!db){renderMe();renderBoard();status(window.backendError==='config'?'Game Night isn\'t connected to Firebase yet. Follow the README to add your config.':'Couldn\'t connect to Game Night. Check your internet and refresh.');return}
  if(user){try{myId=await user.id()}catch(e){}try{const c=await user.can('data.write');canWrite=c===null?null:!!c}catch(e){}}
  if(!myId)canWrite=false;
  
  let lt=setTimeout(()=>{$('lb').innerHTML='<div class="empty">Can\'t reach the leaderboard yet.</div>'},10000);
  db.collection('players').onSnapshot(s=>{players={};s.docs.forEach(d=>players[d.id]=d.data());me=myId?players[myId]||null:null;renderMe();renderBoard();if(room)renderRoom()},()=>{});
  db.collection('results').orderBy('finishedAt','desc').limit(500).onSnapshot(s=>{if(!s.metadata.fromCache)clearTimeout(lt);results=s.docs.map(d=>({id:d.id,...d.data()}));renderBoard();renderMe()},()=>{clearTimeout(lt);$('lb').innerHTML='<div class="empty">Couldn\'t load the leaderboard.</div>'});
  const c=hashRoom();if(c){openRoom(c,true)}
})();
})();
