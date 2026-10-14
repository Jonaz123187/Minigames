
'use strict';
const $ = id => document.getElementById(id);
const socket = io({ reconnection: true });
const canvas = $('canvas'), ctx = canvas.getContext('2d');
const W = 1120, H = 630;
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
let catalog = [], room = null, state = null, selected = 'race', myId = null;
let offset = 0, clockSynced = false, toastTimer, typingIndex = 0, typingPending = false;
let lastFrame = performance.now(), frameDt = 1/60, pointerTarget = null, pulse = 0;
const keys = new Set(), touchKeys = new Set(), poses = new Map();
const game = () => catalog.find(g => g.id === room?.round?.game);
const active = () => room?.phase === 'playing';
const serverNow = () => Date.now() + offset;
const roster = () => room?.round?.roster || [];
const playerName = p => p.name + (p.id === myId ? ' (du)' : '');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function toast(text, error = false) {
  $('toast').textContent = text; $('toast').classList.toggle('error', error); $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4500);
}
function rpc(event, data) {
  return new Promise(resolve => socket.timeout(5000).emit(event, data, (err, result) => {
    if (err) return resolve({ ok:false, error:'Keine Antwort. Verbindung prüfen und erneut versuchen.' });
    resolve(result || {ok:false});
  }));
}
async function enter(action) {
  if (!socket.connected) return toast('Noch keine Verbindung zum Server.', true);
  if (!$('name').reportValidity()) return;
  if (action === 'join' && !/^[A-Z2-9]{6}$/i.test($('code').value.trim())) return toast('Bitte einen sechsstelligen Raumcode eingeben.', true);
  try { localStorage.setItem('kumpel-name', $('name').value); } catch { /* storage optional */ }
  const result = await rpc('lobby', {action, name:$('name').value, code:$('code').value});
  if (!result.ok) toast(result.error || 'Beitritt fehlgeschlagen.', true);
}
$('create').onclick = () => enter('create');
$('entryForm').onsubmit = e => { e.preventDefault(); enter('join'); };
$('code').oninput = () => { $('code').value = $('code').value.toUpperCase().replace(/[^A-Z2-9]/g,''); };
try { $('name').value = localStorage.getItem('kumpel-name') || ''; } catch { /* storage optional */ }
const sharedCode=new URLSearchParams(location.search).get('room');if(sharedCode)$('code').value=sharedCode.toUpperCase().slice(0,6);
$('leave').onclick = async () => {
  const result = await rpc('lobby', {action:'leave'});
  if (!result.ok) return toast(result.error || 'Verlassen fehlgeschlagen.', true);
  resetLocal();
};
$('copyCode').onclick = async () => {
  try { await navigator.clipboard.writeText(room.code); toast('Raumcode kopiert: ' + room.code); }
  catch { toast('Dein Raumcode: ' + room.code); }
};
$('start').onclick = async () => {
  const result = await rpc('start', {game:room.selected || selected, practice:$('practice').checked});
  if (!result.ok) toast(result.error || 'Start fehlgeschlagen.', true);
};
function resetLocal() {
  if (room) $('code').value = room.code;
  room = null; state = null; poses.clear(); releaseKeys(); showScreen('home'); $('leave').hidden = true;
}
function showScreen(id) {
  for (const name of ['home','lobby','play','results']) $(name).hidden = name !== id;
}
function network(online) {
  $('network').classList.toggle('online', online);
  $('networkText').textContent = online ? 'Verbunden' : 'Verbindung weg';
}
function syncClock() {
  if (!socket.connected) return;
  const sent = Date.now();
  socket.timeout(2500).emit('clock', {}, (err, value) => {
    if (!err && value) { offset = value.now - (sent + Date.now()) / 2; clockSynced = true; }
  });
}
socket.on('connect', () => { myId = socket.id; network(true); syncClock(); });
socket.on('disconnect', () => { network(false); resetLocal(); toast('Verbindung getrennt. Nach dem Verbinden erneut mit dem Code beitreten.', true); });
socket.on('connect_error', () => network(false));
socket.on('catalog', items => { catalog = items; if (room) renderRoom(room); });
socket.on('notice', message => toast(message));
socket.on('room', next => renderRoom(next));
socket.on('state', packet => {
  if (packet.roundId !== room?.round?.id) return;
  if (!clockSynced) offset = packet.serverNow - Date.now();
  state = packet.data;
  if (room.round.game === 'typing') {
    const index = state.players[myId]?.index || 0;
    if (index > typingIndex) { typingIndex = index; updateWords(); }
  }
});
setInterval(syncClock, 5000);

function renderRoom(next) {
  const previousRound = room?.round?.id, previousPhase = room?.phase;
  const previousPlayers = room?.players?.length || 0;
  room = next;
  if (next.selected) selected = next.selected;
  if (!clockSynced) offset = next.serverNow - Date.now();
  $('leave').hidden = false;
  if (next.round?.id !== previousRound) {
    state = null; poses.clear(); typingIndex = 0; typingPending = false;
    $('typingInput').value = ''; releaseKeys();
  }
  const isHost = next.hostId === myId;
  if (next.phase === 'lobby') {
    showScreen('lobby'); $('roomCode').textContent = next.code;
    $('playerCount').textContent = next.players.length + ' / 8';
    $('players').replaceChildren(...next.players.map(p => {
      const row = document.createElement('div'); row.className = 'player';
      const avatar = document.createElement('div'); avatar.className = 'avatar';
      avatar.style.background = p.color + '20'; avatar.style.color = p.color; avatar.textContent = p.name.slice(0,2).toUpperCase();
      const name = document.createElement('div'); name.className = 'player-name'; name.textContent = playerName(p);
      const sub = document.createElement('small'); sub.textContent = p.id === next.hostId ? 'HOST' : 'BEREIT'; name.append(sub);
      const score = document.createElement('div'); score.className = 'player-score mono'; score.textContent = p.score;
      row.append(avatar,name,score); return row;
    }));
    $('hostHint').textContent = isHost ? 'Du bist Host. Such ein Spiel aus und starte die Runde.' : 'Der Host wählt das nächste Spiel und startet die Runde.';
    $('games').replaceChildren(...catalog.map(g => {
      const card = document.createElement('button'); card.className = 'game-card' + (g.id === selected ? ' selected' : '');
      card.setAttribute('aria-pressed', String(g.id === selected));
      const top = document.createElement('div'); top.className = 'game-number';
      const num = document.createElement('b'); num.textContent = '/' + g.icon;
      const time = document.createElement('span'); time.textContent = g.seconds + ' SEK';
      top.append(num,time);
      const h = document.createElement('h3'); h.textContent = g.title;
      const p = document.createElement('p'); p.textContent = g.description;
      card.append(top,h,p);
      card.onclick = () => { selected = g.id; renderRoom(room); };
      return card;
    }));
    $('start').disabled = !isHost || next.players.length < 2;
    $('launchHint').textContent = next.players.length < 2 ? 'Teile den Raumcode. Ab zwei Spielern geht’s los.' : isHost ? 'Alle dabei? Drei Sekunden Countdown, dann geht’s los.' : 'Warte auf den Start durch den Host.';
    renderLastResult();
    renderPremiumLobby();
    return;
  }
  if (next.phase === 'results') { releaseKeys(); showScreen('results'); renderResults(); if (next.lastResult.practice) { $('resultTitle').textContent='Training abgeschlossen.'; $('resultSub').textContent='Dein persönliches Ergebnis. Im Training werden keine Arcade-Punkte vergeben.'; } premiumPhaseChanged(previousPhase); return; }
  showScreen('play');
  const g = game(); if (!g) return;
  $('gameTitle').textContent = g.title; $('gameNumber').textContent = '/' + g.icon;
  $('instructions').textContent = g.controls;
  $('roundPhase').textContent = next.phase === 'countdown' ? 'Bereitmachen' : 'Live · ' + next.players.length + ' Spieler';
  $('countdown').hidden = next.phase !== 'countdown';
  $('action').hidden = !['click','reaction'].includes(g.id);
  $('action').disabled = !active();
  $('action').textContent = g.id === 'click' ? 'KLICK! / LEERTASTE' : 'DRÜCKEN!';
  $('typingPanel').hidden = g.id !== 'typing'; $('typingInput').disabled = !active();
  renderTouch(g.id);
  if (g.id === 'typing') {
    updateWords();
    if (next.phase === 'playing' && previousPhase !== 'playing') $('typingInput').focus({preventScroll:true});
  }
  setupGamePanel();
  premiumPhaseChanged(previousPhase);
  requestAnimationFrame(resizeCanvas);
}
function renderLastResult() {
  const box = $('lastRound'), result = room.lastResult; box.hidden = !result;
  if (!result) return;
  const label = document.createElement('div'); label.className = 'panel-title'; label.textContent = 'Letzte Runde · ' + result.title;
  box.replaceChildren(label, ...result.rows.map(p => {
    const line = document.createElement('p'); line.textContent = `#${p.rank} ${p.name}  +${p.points}`; return line;
  }));
}
function renderResults() {
  const r = room.lastResult;
  $('resultTitle').textContent = r.rows.filter(p => p.rank === 1).length > 1 ? 'Geteilter Sieg.' : 'Die Runde geht an ' + r.rows[0].name + '.';
  $('resultSub').textContent = r.title + ' · Die Arcade-Punkte sind auf eurem Lobby-Konto.';
  $('resultRows').replaceChildren(...r.rows.map(p => {
    const row = document.createElement('tr'); if (p.rank === 1) row.className = 'first';
    const rank = document.createElement('td'); rank.className = 'rank'; rank.textContent = String(p.rank).padStart(2,'0');
    const name = document.createElement('td'); name.textContent = playerName(p); name.style.color = p.color;
    const detail = document.createElement('small'); detail.textContent = p.detail + (p.connected ? '' : ' · aufgegeben'); name.append(detail);
    const points = document.createElement('td'); points.className = 'points mono'; points.textContent = '+' + p.points;
    row.append(rank,name,points); return row;
  }));
}

function send(data, ack) {
  if (active() && socket.connected) socket.emit('input', {...data, roundId:room.round.id}, ack);
}
function hit() { send({action:'hit'}); pulse = 1; if(typeof Sound!=='undefined')Sound.fx('tap'); }
$('action').onclick = hit;
function releaseKeys() {
  keys.clear(); touchKeys.clear(); pointerTarget = null;
  document.querySelectorAll('.held').forEach(el => el.classList.remove('held'));
  if (active()) send({kind:'controls',throttle:0,tilt:0,axis:0,target:null});
}
function snakeDirection(key) {
  return ({ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'})[key];
}
document.addEventListener('keydown', e => {
  if (!active() || ['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
  const controlKeys = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','Space','KeyR'];
  if (!controlKeys.includes(e.code)) return;
  e.preventDefault(); keys.add(e.code); pointerTarget = null;
  if (room.round.game === 'snake' && snakeDirection(e.code)) send({dir:snakeDirection(e.code)});
  if (e.code === 'Space' && !e.repeat && ['click','reaction'].includes(room.round.game)) hit();
  if (e.code === 'KeyR' && !e.repeat && room.round.game === 'race') send({action:'reset'});
});
document.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', releaseKeys);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseKeys(); });
setInterval(() => {
  if (!active() || !['race','pong','dodge','tag','bomber','runner'].includes(room.round.game)) return;
  const down = (...codes) => codes.some(c => keys.has(c) || touchKeys.has(c)) ? 1 : 0;
  send({kind:'controls', throttle:down('ArrowUp','KeyW') - down('ArrowDown','KeyS'),
    tilt:down('ArrowRight','KeyD') - down('ArrowLeft','KeyA'),
    axis:down('ArrowRight','KeyD') - down('ArrowLeft','KeyA'), target:pointerTarget});
},50);
function renderTouch(id) {
  const definitions = id === 'race' ? [['↶','KeyA'],['↷','KeyD'],['Bremse','KeyS'],['Gas ↑','KeyW'],['Bergen','KeyR']]
    : id === 'snake' ? [['←','ArrowLeft'],['↑','ArrowUp'],['↓','ArrowDown'],['→','ArrowRight']]
    : id === 'pong' ? [['←','ArrowLeft'],['→','ArrowRight']] : [];
  $('touchControls').replaceChildren(...definitions.map(([label,key]) => {
    const b = document.createElement('button'); b.textContent = label; b.type = 'button';
    b.setAttribute('aria-label',label); b.disabled = !active();
    b.onpointerdown = e => {
      e.preventDefault(); b.setPointerCapture(e.pointerId); touchKeys.add(key); pointerTarget = null; b.classList.add('held');
      if (id === 'snake') send({dir:snakeDirection(key)});
      if (key === 'KeyR') send({action:'reset'});
    };
    const release = () => { touchKeys.delete(key); b.classList.remove('held'); };
    b.onpointerup = release; b.onpointercancel = release; b.onlostpointercapture = release;
    return b;
  }));
}
function pongBoxes() {
  const all = roster(), columns = all.length <= 4 ? all.length : Math.ceil(all.length / 2), rows = all.length <= 4 ? 1 : 2;
  const cellW = (W - 48) / columns, cellH = (H - 52) / rows;
  return all.map((p,i) => {
    const scale = Math.min((cellW-20)/300,(cellH-45)/400);
    return {id:p.id,x:24+(i%columns)*cellW+(cellW-300*scale)/2,y:47+Math.floor(i/columns)*cellH,scale,w:300*scale,h:400*scale};
  });
}
function pointPong(e) {
  if (!active() || room.round.game !== 'pong') return;
  const rect = canvas.getBoundingClientRect(), x = (e.clientX-rect.left)/rect.width*W;
  const box = pongBoxes().find(b => b.id === myId); if (!box) return;
  pointerTarget = clamp((x-box.x)/box.w,0,1);
}
canvas.onpointermove = pointPong;
canvas.onpointerdown = e => { pointPong(e); if (room?.round?.game === 'pong') canvas.setPointerCapture(e.pointerId); };

function updateWords() {
  if (room?.round?.game !== 'typing') return;
  const words = room.round.meta.words;
  $('words').replaceChildren(...words.map((word,i) => {
    const span = document.createElement('span'); span.textContent = word;
    span.className = i < typingIndex ? 'done' : i === typingIndex ? 'current' : ''; return span;
  }));
  $('typingInput').placeholder = words[typingIndex] || 'Text geschafft!';
}
async function submitWord() {
  if (!active() || typingPending || room.round.game !== 'typing') return;
  const word = $('typingInput').value.trim(), target = room.round.meta.words[typingIndex];
  if (!word || word !== target) { $('typingInput').classList.add('invalid'); return; }
  typingPending = true;
  const roundId = room.round.id;
  const submittedIndex = typingIndex;
  typingIndex++; $('typingInput').value = ''; updateWords();
  const result = await rpc('input',{roundId,word});
  typingPending = false;
  if (room?.round?.id !== roundId) return;
  if (result.ok) {
    typingIndex = Math.max(typingIndex,result.index);
    $('typingInput').classList.remove('invalid'); updateWords();
    if ($('typingInput').value.endsWith(' ')) submitWord();
  } else if (active()) {
    typingIndex = submittedIndex; $('typingInput').value = word; updateWords();
    toast('Wort noch nicht gewertet. Bitte erneut abschicken.', true);
  }
}
$('typingForm').onsubmit = e => { e.preventDefault(); submitWord(); };
$('typingInput').oninput = e => {
  const target = room?.round?.meta.words?.[typingIndex] || '';
  $('typingInput').classList.toggle('invalid', !target.startsWith($('typingInput').value.trim()));
  if (!e.isComposing && $('typingInput').value.endsWith(' ')) submitWord();
};
for (const event of ['paste','drop']) $('typingInput').addEventListener(event, e => { e.preventDefault(); toast('Tippe die Wörter selbst.'); });

// Rendering is independent of networking: 60 Hz animation, 20 Hz server snapshots.
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
  const dpr = Math.min(devicePixelRatio || 1,2);
  const width = Math.round(rect.width*dpr), height = Math.round(rect.height*dpr);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
}
new ResizeObserver(resizeCanvas).observe(canvas);
function text(value,x,y,size=14,color='#f1f4e9',align='left') {
  ctx.fillStyle=color; ctx.font=`${size >= 24 ? 700 : 500} ${size}px Arial,sans-serif`; ctx.textAlign=align; ctx.fillText(String(value),x,y);
}
function rect(x,y,w,h,color,r=0) {
  ctx.fillStyle=color; ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fill();
}
function circle(x,y,r,color) { ctx.fillStyle=color; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); }
function line(x1,y1,x2,y2,color,width=1) {
  ctx.strokeStyle=color; ctx.lineWidth=width; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
}
function background() {
  rect(0,0,W,H,'#141a12'); ctx.strokeStyle='#222b1d'; ctx.lineWidth=1;
  ctx.beginPath(); for(let x=0;x<W;x+=40){ctx.moveTo(x,0);ctx.lineTo(x,H);}for(let y=0;y<H;y+=40){ctx.moveTo(0,y);ctx.lineTo(W,y);}ctx.stroke();
}
function smooth(key,target,angle=false) {
  let value = poses.get(key);
  if (value === undefined || Math.abs(target-value) > (angle ? 20 : 220)) value=target;
  const delta = angle ? Math.atan2(Math.sin(target-value),Math.cos(target-value)) : target-value;
  value += delta*(reducedMotion ? 1 : 1-Math.exp(-frameDt*20)); poses.set(key,value); return value;
}
function renderRace() {
  const meta = room.round.meta, mine=state.players[myId]; if(!mine)return;
  const camX=smooth('cameraX',mine.x-280), camY=smooth('cameraY',mine.y-330);
  for(let layer=0;layer<2;layer++){
    ctx.fillStyle=layer?'#26351e':'#1d2919';ctx.beginPath();ctx.moveTo(0,H);
    for(let x=0;x<=W+30;x+=30)ctx.lineTo(x,265+layer*110-Math.sin((x+camX*(layer?.3:.12))/210+layer)*80);
    ctx.lineTo(W,H);ctx.fill();
  }
  ctx.save();ctx.translate(-camX,-camY);
  ctx.fillStyle='#34472a';ctx.beginPath();ctx.moveTo(meta.terrain[0][0],1100);
  meta.terrain.forEach(([x,y])=>ctx.lineTo(x,y));ctx.lineTo(meta.terrain.at(-1)[0],1100);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#b5f36a';ctx.lineWidth=4;ctx.beginPath();meta.terrain.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
  const endY=meta.terrain.reduce((best,p)=>Math.abs(p[0]-meta.finish)<Math.abs(best[0]-meta.finish)?p:best)[1];
  line(meta.finish,endY,meta.finish,endY-150,'#e8eddc',5);
  for(let i=0;i<4;i++)for(let j=0;j<3;j++)rect(meta.finish+i*12,endY-150+j*12,12,12,(i+j)%2?'#eef4e8':'#1a2116');
  const ordered = [...roster()].sort((a,b)=>Number(a.id===myId)-Number(b.id===myId));
  ordered.forEach(p=>{
    const car=state.players[p.id];if(!car)return;
    const x=smooth(p.id+'x',car.x),y=smooth(p.id+'y',car.y),a=smooth(p.id+'a',car.angle,true);
    ctx.globalAlpha=p.id===myId?1:.65;
    car.wheels.forEach((w,i)=>{
      const wx=smooth(p.id+'wx'+i,w.x),wy=smooth(p.id+'wy'+i,w.y),wa=smooth(p.id+'wa'+i,w.angle,true);
      const dx=i===0?-26:26; const sx=x+Math.cos(a)*dx,sy=y+Math.sin(a)*dx;
      line(sx,sy,wx,wy,'#aab69e',3);
      ctx.save();ctx.translate(wx,wy);ctx.rotate(wa);circle(0,0,16,'#0c100b');circle(0,0,9,'#77866c');line(-8,0,8,0,'#d5dfcd',3);line(0,-8,0,8,'#d5dfcd',3);ctx.restore();
    });
    ctx.save();ctx.translate(x,y);ctx.rotate(a);rect(-35,-12,70,24,p.color,5);rect(-16,-26,35,17,p.color,4);rect(-12,-23,24,11,'#243020',2);rect(28,-7,7,6,'#fff5bd',1);ctx.restore();
    text(playerName(p),x,y-45-(roster().findIndex(v=>v.id===p.id)%3)*16,13,p.color,'center');ctx.globalAlpha=1;
  });
  ctx.restore();
  const totalDistance=(meta.finish-100)/10;
  rect(25,23,235,77,'#111a10e8',12);text('DEINE STRECKE',42,47,10,'#a4ad9d');text(mine.distance+' m',42,79,26,'#b5f36a');text('Ziel: '+totalDistance+' m',165,78,11,'#a4ad9d');
  roster().forEach((p,i)=>{
    const c=state.players[p.id];if(!c)return;
    rect(315,32+i*8,W-355,3,'#2d3826',2);circle(315+clamp(c.distance/totalDistance,0,1)*(W-355),33+i*8,4,p.color);
  });
}
function renderSnake() {
  const meta=room.round.meta, cell=Math.min((W-70)/meta.width,(H-95)/meta.height),left=(W-cell*meta.width)/2,top=65;
  text('EIN FELD. KEIN PLATZ FÜR FEHLER.',left,34,12,'#a4ad9d');
  roster().forEach((p,i)=>text(p.id===myId?'DU':p.name.slice(0,10),left+i*(meta.width*cell)/roster().length,54,11,p.color));
  rect(left-3,top-3,meta.width*cell+6,meta.height*cell+6,'#59694a',6);rect(left,top,meta.width*cell,meta.height*cell,'#10170e',3);
  state.food.forEach(f=>{circle(left+(f.x+.5)*cell,top+(f.y+.5)*cell,cell*.22,'#f0bc76');});
  roster().forEach(p=>{
    const s=state.players[p.id];if(!s)return;ctx.globalAlpha=s.alive?1:.2;
    s.body.forEach((b,i)=>{
      const x=smooth(p.id+'sx'+i,b.x*cell),y=smooth(p.id+'sy'+i,b.y*cell);
      rect(left+x+1,top+y+1,cell-2,cell-2,p.color,cell*.22);
      if(i===0){
        const hx=left+x+cell*.5,hy=top+y+cell*.5,dx=s.dir.x,dy=s.dir.y;
        circle(hx+dx*cell*.21-dy*cell*.2,hy+dy*cell*.21+dx*cell*.2,cell*.095,'#17220e');
        circle(hx+dx*cell*.21+dy*cell*.2,hy+dy*cell*.21-dx*cell*.2,cell*.095,'#17220e');
      }
    });ctx.globalAlpha=1;
  });
  const mine=state.players[myId];if(mine&&!mine.alive){rect(W/2-155,H/2-40,310,80,'#141a12ee',12);text('RAUS! WEITER ZUSCHAUEN …',W/2,H/2+5,17,'#ffb86b','center');}
}
function renderClick() {
  const max=Math.max(20,...Object.values(state.players).map(p=>p.clicks));
  text('10 SEKUNDEN. ALLES GEBEN.',50,50,13,'#a4ad9d');
  const step=Math.min(61,450/roster().length);
  roster().forEach((p,i)=>{
    const score=state.players[p.id]?.clicks||0,y=100+i*step;
    text(playerName(p),50,y+24,16,p.color);rect(255,y,740,32,'#263020',6);
    rect(255,y,smooth(p.id+'click',score/max*740),32,p.color,6);text(score,1055,y+24,24,p.color,'right');
  });
  if(pulse>0){ctx.globalAlpha=pulse*.12;rect(0,0,W,H,'#b5f36a');ctx.globalAlpha=1;}
  text('Dein Rhythmus. Dein Highscore.',W/2,H-30,14,'#a4ad9d','center');
}
function renderTyping() {
  const total=room.round.meta.words.length,step=Math.min(64,465/roster().length);
  text('WORT FÜR WORT RICHTUNG ZIEL.',45,45,13,'#a4ad9d');
  roster().forEach((p,i)=>{
    const index=state.players[p.id]?.index||0,y=100+i*step;
    text(playerName(p),45,y+19,15,p.color);line(240,y+12,995,y+12,'#33412b',2);
    const x=smooth(p.id+'type',240+index/total*755);
    rect(x-15,y-1,30,18,p.color,4);circle(x-8,y+19,5,'#bac9ae');circle(x+8,y+19,5,'#bac9ae');
    text(index+'/'+total,1065,y+18,16,p.color,'right');
  });
  text('Das markierte Wort steht unter dem Spielfeld. Leertaste oder Enter bestätigt.',W/2,H-24,13,'#a4ad9d','center');
}
function renderPong() {
  const boxes=pongBoxes();
  boxes.forEach(box=>{
    const p=roster().find(v=>v.id===box.id),b=state.players[box.id];if(!b)return;
    text(playerName(p),box.x,box.y-14,Math.min(15,13+box.scale),p.color);
    ctx.save();ctx.translate(box.x,box.y);ctx.scale(box.scale,box.scale);
    rect(-2,-2,304,404,p.id===myId?'#b5f36a':'#46543c',5);rect(0,0,300,400,'#10170e',3);
    ctx.setLineDash([6,8]);line(0,200,300,200,'#34422d',1);ctx.setLineDash([]);
    const x=smooth(p.id+'px',b.x),y=smooth(p.id+'py',b.y),paddle=smooth(p.id+'pad',b.paddle);
    rect(paddle-36,368,72,10,p.color,4);circle(x,y,8,'#f0f5e7');
    text(String(Math.max(0,b.hits*10-b.misses*3)),150,65,34,p.color,'center');
    text(b.hits+' Treffer · '+b.misses+' verpasst',150,91,12,'#a4ad9d','center');
    ctx.restore();
  });
  text('DEINE BAHN IST GRÜN UMRANDET · JEDER SPIELT SEINEN BALL',W/2,H-10,11,'#a4ad9d','center');
}
function renderReaction() {
  const mine=state.players[myId],done=mine?.current!==null;
  text('SIGNAL '+state.trial+' / 5',W/2,49,13,'#a4ad9d','center');
  const lit=state.go&&!done;
  const color=done?(mine.current<0?'#ff8e9f':'#a998ff'):lit?'#b5f36a':'#57352c';
  circle(W/2,240,128,color+'18');circle(W/2,240,104,color);
  text(done?(mine.current<0?'ZU FRÜH!':mine.current+' ms'):lit?'JETZT!':'WARTEN',W/2,251,32,lit?'#17220e':done?'#17220e':'#d9a48b','center');
  text(state.intermission?'Nächstes Signal …':done?'Versuch gewertet. Warte auf die anderen.':'Erst drücken, wenn das Signal grün leuchtet.',W/2,410,17,'#a4ad9d','center');
  roster().forEach((p,i)=>{
    const player=state.players[p.id],x=65+i*(W-130)/Math.max(1,roster().length-1),y=500;
    circle(x,y,5,p.color);text(p.name.slice(0,12),x,y+28,12,p.color,'center');
    text(player?.current===null?'…':player?.current<0?'Frühstart':player?.current+' ms',x,y+51,12,'#a4ad9d','center');
  });
}
const renderers={race:renderRace,snake:renderSnake,click:renderClick,typing:renderTyping,pong:renderPong,reaction:renderReaction};
function frame(now) {
  frameDt=Math.min((now-lastFrame)/1000,.1);lastFrame=now;pulse=Math.max(0,pulse-frameDt*4);
  if(room?.round){
    const time=serverNow(),remaining=Math.max(0,Math.ceil((room.round.endsAt-time)/1000));
    $('timer').textContent=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');
    if(room.phase==='countdown')$('countdownNumber').textContent=Math.max(1,Math.ceil((room.round.startsAt-time)/1000));
    if(room.phase==='results')$('backCounter').textContent='Zurück in der Lobby in '+Math.max(0,Math.ceil((room.returnAt-time)/1000))+' Sekunden …';
    if(!$('play').hidden){
      ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);background();
      if(state){renderers[room.round.game]?.();premiumFrame(time);}else text('Spielfeld wird vorbereitet …',W/2,H/2,22,'#a4ad9d','center');
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
