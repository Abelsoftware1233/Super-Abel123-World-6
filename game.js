// ============================================================
// KINGDOM DASH: WORLD TOUR — GAME ENGINE
// ============================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function computeCanvasSize(){
  const screenRatio = window.innerWidth / window.innerHeight;
  if (screenRatio >= 1.2) return {w:960, h:540};
  else if (screenRatio >= 0.75) return {w:720, h:640};
  else return {w:540, h:760};
}
const CANVAS_SIZE = computeCanvasSize();
canvas.width = CANVAS_SIZE.w;
canvas.height = CANVAS_SIZE.h;
let W = canvas.width, H = canvas.height;

let unlockedLevel = 0;
let levelStars = {};
try {
  unlockedLevel = parseInt(localStorage.getItem('kd_unlocked')||'0');
  levelStars = JSON.parse(localStorage.getItem('kd_stars')||'{}');
} catch(e){}
function saveProgress(){
  try{
    localStorage.setItem('kd_unlocked', String(unlockedLevel));
    localStorage.setItem('kd_stars', JSON.stringify(levelStars));
  }catch(e){}
}

const keys = {};
window.addEventListener('keydown', e=>{
  keys[e.code]=true;
  if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e=> keys[e.code]=false);

function bindTouch(id, downKey){
  const el = document.getElementById(id);
  const set = v => { keys[downKey]=v; };
  el.addEventListener('touchstart', e=>{e.preventDefault(); set(true);}, {passive:false});
  el.addEventListener('touchend', e=>{e.preventDefault(); set(false);}, {passive:false});
  el.addEventListener('mousedown', e=>{e.preventDefault(); set(true);});
  el.addEventListener('mouseup', e=>{e.preventDefault(); set(false);});
  el.addEventListener('mouseleave', e=> set(false));
}
bindTouch('btnLeft','ArrowLeft');
bindTouch('btnRight','ArrowRight');
bindTouch('btnJump','Space');
bindTouch('btnRun','ShiftLeft');

let state = 'title';
let currentLevelIndex = 0;
let level = null;
let camX = 0;
let particles = [];
let floatingTexts = [];

const player = {
  x:0,y:0,w:26,h:34,vx:0,vy:0,
  onGround:false, facing:1, power:'small',
  invincible:0, starTime:0, lives:3, coins:0, score:0,
  hurtTime:0, crouching:false, jumping:false,
  shieldHits:0, flying:0,
};

let elapsedTime = 0;
let timeLeft = 300;

const screens = ['titleScreen','howtoScreen','levelSelectScreen','pauseScreen','winScreen','loseScreen','allClearScreen'];
function showScreen(id){
  screens.forEach(s => document.getElementById(s).classList.toggle('hidden', s!==id));
  document.getElementById('hudBar').classList.toggle('hidden', id!=='');
}
function hideAllScreens(){
  screens.forEach(s => document.getElementById(s).classList.add('hidden'));
}

document.getElementById('startBtn').onclick = () => { playSfx('select'); buildLevelGrid(); showScreen('levelSelectScreen'); };
document.getElementById('howtoBtn').onclick = () => showScreen('howtoScreen');
document.getElementById('backFromHowto').onclick = () => showScreen('titleScreen');
document.getElementById('backToTitle').onclick = () => showScreen('titleScreen');
document.getElementById('resumeBtn').onclick = () => resumeGame();
document.getElementById('restartLevelBtn').onclick = () => startLevel(currentLevelIndex);
document.getElementById('quitToMenuBtn').onclick = () => { hideAllScreens(); buildLevelGrid(); showScreen('levelSelectScreen'); document.getElementById('pauseBtn').classList.add('hidden'); document.getElementById('musicBtn').classList.add('hidden'); document.getElementById('sfxBtn').classList.add('hidden'); stopMusic(); };
document.getElementById('nextLevelBtn').onclick = () => {
  if (currentLevelIndex < 19) startLevel(currentLevelIndex+1);
  else { hideAllScreens(); showScreen('allClearScreen'); }
};
document.getElementById('menuFromWinBtn').onclick = () => { hideAllScreens(); buildLevelGrid(); showScreen('levelSelectScreen'); document.getElementById('pauseBtn').classList.add('hidden'); document.getElementById('musicBtn').classList.add('hidden'); document.getElementById('sfxBtn').classList.add('hidden'); stopMusic(); };
document.getElementById('retryBtn').onclick = () => startLevel(currentLevelIndex);
document.getElementById('menuFromLoseBtn').onclick = () => { hideAllScreens(); buildLevelGrid(); showScreen('levelSelectScreen'); document.getElementById('pauseBtn').classList.add('hidden'); document.getElementById('musicBtn').classList.add('hidden'); document.getElementById('sfxBtn').classList.add('hidden'); stopMusic(); };
document.getElementById('allClearMenuBtn').onclick = () => { hideAllScreens(); buildLevelGrid(); showScreen('levelSelectScreen'); };
document.getElementById('pauseBtn').onclick = () => pauseGame();
document.getElementById('musicBtn').onclick = () => { toggleMusic(); document.getElementById('musicBtn').textContent = musicOn?'🎵':'🔇'; };
document.getElementById('sfxBtn').onclick = () => { toggleSfx(); document.getElementById('sfxBtn').textContent = sfxOn?'🔊':'🔈'; playSfx('select'); };

function buildLevelGrid(){
  const grid = document.getElementById('levelGrid');
  grid.innerHTML = '';
  for (let i=0;i<20;i++){
    const meta = ALL_LEVELS_META[i];
    const btn = document.createElement('div');
    const locked = i > unlockedLevel;
    btn.className = 'lvlBtn' + (locked ? ' locked':'');
    const stars = levelStars[i]||0;
    btn.innerHTML = `${meta.isBoss?'👑':meta.world+'-'+meta.stage}<div class="stars">${locked?'🔒':'⭐'.repeat(stars)}</div>`;
    if (!locked) btn.onclick = () => startLevel(i);
    grid.appendChild(btn);
  }
}

function pauseGame(){ if(state==='playing'){ state='paused'; showScreen('pauseScreen'); playSfx('pause'); stopMusic(); } }
function resumeGame(){ state='playing'; hideAllScreens(); document.getElementById('pauseBtn').classList.remove('hidden'); startMusic(level.worldNum-1); }

window.addEventListener('keydown', e=>{
  if (e.code==='Escape' || e.code==='KeyP'){
    if (state==='playing') pauseGame();
    else if (state==='paused') resumeGame();
  }
});

function startLevel(idx){
  currentLevelIndex = idx;
  level = buildLevel(idx);
  level.entities = JSON.parse(JSON.stringify(level.entities));
  level.entities.enemies.forEach(e=>{ e.alive=true; e.hp = e.type==='spiky'?1:(e.type==='hopper'?2:1); e.dir=-1; e.vy=0; e.baseX=e.x; e.baseY=e.y; e.t=Math.random()*100; });
  level.entities.coins.forEach(c=> c.collected=false);
  level.entities.powerups.forEach(p=> p.collected=false);
  level.boss = level.boss ? {...level.boss, alive:true, hitCooldown:0} : null;

  player.x = 2*TILE; player.y = (level.groundY-3)*TILE;
  player.vx=0; player.vy=0; player.onGround=false; player.facing=1;
  player.power = 'small'; player.invincible=90; player.hurtTime=0; player.lives=3;
  player.coins=0; player.starTime=0; player.shieldHits=0;
  timeLeft = level.timeLimit;
  elapsedTime=0;
  particles = []; floatingTexts=[];
  camX=0;
  state='playing';
  hideAllScreens();
  document.getElementById('pauseBtn').classList.remove('hidden');
  document.getElementById('musicBtn').classList.remove('hidden');
  document.getElementById('sfxBtn').classList.remove('hidden');
  document.getElementById('hudBar').classList.remove('hidden');
  document.getElementById('levelLabel').textContent = `World ${level.worldNum}-${level.stageNum}`;
  showMsg(level.name, 1600);
  updatePowerIcon();
  try { startMusic(level.worldNum-1); } catch(e){}
  if (level.isBoss) setTimeout(()=>playSfx('bossRoar'), 800);
  draw();
}

function showMsg(txt, ms){
  const el = document.getElementById('msgOverlay');
  el.textContent = txt;
  el.style.opacity = 1;
  clearTimeout(el._t);
  el._t = setTimeout(()=> el.style.opacity=0, ms);
}

function updatePowerIcon(){
  const hearts = document.getElementById('hearts');
  const label = {small:'Small 🙂',big:'Big 🍄',fire:'Fire 🔥',star:'STAR ⭐',feather:'Feather 🪶',shield:'Shield 🛡️'}[player.power];
  hearts.textContent = label + '  ❤️'.repeat(player.lives);
}

// ---------- Physics ----------
const GRAVITY = 0.62;
const MOVE_ACC = 0.6;
const MAX_SPEED = 4.6;
const RUN_SPEED = 7.2;
const FRICTION = 0.72;
const JUMP_V = -12.6;
const JUMP_HOLD = 0.42;

function tileAt(tx,ty){
  if (ty<0||ty>=level.height||tx<0||tx>=level.width) return 0;
  return level.tiles[ty][tx];
}
function solidTile(v){ return v===1||v===2||v===3||v===4||v===5||v===9; }

function rectVsTiles(px,py,pw,ph, callback){
  const x0=Math.floor(px/TILE), x1=Math.floor((px+pw)/TILE);
  const y0=Math.floor(py/TILE), y1=Math.floor((py+ph)/TILE);
  for(let ty=y0;ty<=y1;ty++) for(let tx=x0;tx<=x1;tx++){
    const v = tileAt(tx,ty);
    if (v) callback(tx,ty,v);
  }
}

function hitBlock(tx,ty,v){
  if (v===3){ level.tiles[ty][tx]=0; spawnCoinPop(tx*TILE+16, ty*TILE); player.coins++; player.score+=100; }
  else if (v===4){ level.tiles[ty][tx]=2; spawnPowerFromBlock(tx*TILE, ty*TILE-TILE); }
  else if (v===2 && player.power!=='small'){ level.tiles[ty][tx]=0; spawnBrickBits(tx*TILE,ty*TILE); player.score+=50; }
}

function spawnCoinPop(x,y){
  particles.push({type:'coinpop', x,y, vy:-6, life:30});
  floatingTexts.push({x,y,text:'+100',life:40,vy:-1});
}
function spawnBrickBits(x,y){
  for(let i=0;i<4;i++) particles.push({type:'brick', x:x+16,y:y+16, vx:(Math.random()-0.5)*6, vy:-6-Math.random()*3, life:40});
}
function spawnPowerFromBlock(x,y){
  const pool = player.power==='small' ? ['mushroom'] : ['fireflower','feather','star','shield'];
  const t = pool[Math.floor(Math.random()*pool.length)];
  level.entities.powerups.push({x,y,type:t,collected:false,rising:8,vx: t==='mushroom'?1.5:0});
}

// ---------- Player update ----------
function updatePlayer(){
  const left = keys['ArrowLeft']||keys['KeyA'];
  const right = keys['ArrowRight']||keys['KeyD'];
  const running = keys['ShiftLeft']||keys['ShiftRight'];
  const jumpKey = keys['Space']||keys['ArrowUp']||keys['KeyW'];
  const downKey = keys['ArrowDown']||keys['KeyS'];

  const topSpeed = running ? RUN_SPEED : MAX_SPEED;
  if (left && !right){ player.vx -= MOVE_ACC; player.facing=-1; }
  else if (right && !left){ player.vx += MOVE_ACC; player.facing=1; }
  else { player.vx *= FRICTION; if (Math.abs(player.vx)<0.05) player.vx=0; }
  player.vx = Math.max(-topSpeed, Math.min(topSpeed, player.vx));

  player.crouching = downKey && player.onGround && player.power!=='small';

  if (jumpKey && player.onGround && !player.jumpLock){
    player.vy = JUMP_V;
    player.onGround=false;
    player.jumpHeld = true;
    player.jumpLock = true;
    playSfx('jump');
  }
  if (!jumpKey) { player.jumpHeld=false; player.jumpLock=false; }
  if (player.jumpHeld && player.vy<0) player.vy -= JUMP_HOLD;

  if (player.power==='feather' && jumpKey && player.vy>1 && player.flying>0){
    player.vy *= 0.85; player.flying--;
  }
  if (player.onGround) player.flying = player.power==='feather'?40:0;

  player.vy += GRAVITY;
  if (player.vy>16) player.vy=16;

  const speed = player.crouching ? player.vx*0.3 : player.vx;
  let nx = player.x + speed;
  const pw = player.w, ph = player.crouching? player.h*0.6: (player.power==='small'?player.h*0.72:player.h);
  const py = player.y + (player.h-ph);
  let blocked=false;
  rectVsTiles(nx + (speed>0?pw*0.3:-pw*0.3), py+2, pw*0.4, ph-4, (tx,ty,v)=>{
    if (solidTile(v)) blocked=true;
  });
  if (!blocked) player.x = nx; else player.vx=0;

  let ny = player.y + player.vy;
  player.onGround=false;
  if (player.vy>0){
    rectVsTiles(player.x+4, ny+ph-2, pw-8, 4, (tx,ty,v)=>{
      if (solidTile(v)){ ny = ty*TILE - ph; player.vy=0; player.onGround=true; }
    });
  } else if (player.vy<0){
    rectVsTiles(player.x+4, ny, pw-8, 4, (tx,ty,v)=>{
      if (solidTile(v)){ ny = (ty+1)*TILE; player.vy=1; hitBlock(tx,ty,v); }
    });
  }
  player.y = ny;

  if (player.y > level.height*TILE + 100) killPlayer();
  if (player.x<0) player.x=0;
  if (player.x > level.width*TILE - pw) player.x = level.width*TILE-pw;

  if (player.invincible>0) player.invincible--;
  if (player.starTime>0){ player.starTime--; if(player.starTime===0) player.power = player._prevPower||'small'; }
  if (player.hurtTime>0) player.hurtTime--;

  const targetCam = player.x - W*0.4;
  camX += (targetCam-camX)*0.15;
  camX = Math.max(0, Math.min(level.width*TILE - W, camX));

  if (player.x > level.goal.x && !level.isBoss){ winLevel(); }
  if (level.isBoss && level.boss && !level.boss.alive && player.x > level.boss.x){ winLevel(); }
}

function killPlayer(){
  if (player.hurtTime>0 || player.invincible>200) return;
  if (player.power!=='small'){
    player.power = 'small'; player.invincible=90; player.hurtTime=60;
    floatingTexts.push({x:player.x,y:player.y,text:'Ouch!',life:40,vy:-1});
    playSfx('hurt');
    return;
  }
  player.lives--;
  playSfx('death');
  if (player.lives<=0){ loseLevel(); }
  else {
    player.x = Math.max(2*TILE, camX+50);
    player.y = (level.groundY-3)*TILE;
    player.vx=0; player.vy=0; player.invincible=120; player.hurtTime=60;
  }
}

function winLevel(){
  state='win';
  stopMusic();
  const timeBonus = Math.floor(timeLeft*3);
  player.score += timeBonus;
  const stars = timeLeft > level.timeLimit*0.6 ? 3 : timeLeft>level.timeLimit*0.3 ? 2 : 1;
  levelStars[currentLevelIndex] = Math.max(levelStars[currentLevelIndex]||0, stars);
  if (currentLevelIndex >= unlockedLevel && unlockedLevel<19) unlockedLevel = currentLevelIndex+1;
  saveProgress();
  document.getElementById('winStats').innerHTML = `Coins: ${player.coins} 🪙 &nbsp;|&nbsp; Score: ${player.score} &nbsp;|&nbsp; ${'⭐'.repeat(stars)}`;
  document.getElementById('pauseBtn').classList.add('hidden');
  document.getElementById('musicBtn').classList.add('hidden');
  document.getElementById('sfxBtn').classList.add('hidden');
  document.getElementById('nextLevelBtn').style.display = currentLevelIndex<19 ? 'inline-block':'none';
  showScreen('winScreen');
  playSfx('win');
}
function loseLevel(){
  state='lose';
  stopMusic();
  document.getElementById('loseStats').textContent = `Score: ${player.score} — Try again!`;
  document.getElementById('pauseBtn').classList.add('hidden');
  document.getElementById('musicBtn').classList.add('hidden');
  document.getElementById('sfxBtn').classList.add('hidden');
  showScreen('loseScreen');
}

// ---------- Enemy AI ----------
function updateEnemies(){
  for (const e of level.entities.enemies){
    if (!e.alive) continue;
    e.t += 1/60;
    switch(e.type){
      case 'goomba': case 'spiky': {
        e.vy=(e.vy||0)+GRAVITY*0.9; e.vy=Math.min(e.vy,14);
        let nx = e.x + e.dir*1.1;
        const gY = groundAheadY(nx, e.y);
        if (gY==null) e.dir*=-1;
        e.x += e.dir*1.1; e.y += e.vy;
        const floorY = snapToGround(e.x, e.y);
        if (floorY!=null && e.y>=floorY){ e.y=floorY; e.vy=0; }
        break;
      }
      case 'koopa': {
        e.vy=(e.vy||0)+GRAVITY*0.9; e.vy=Math.min(e.vy,14);
        let nx = e.x + e.dir*1.5;
        const gY = groundAheadY(nx, e.y);
        if (gY==null) e.dir*=-1;
        e.x += e.dir*1.5; e.y += e.vy;
        const floorY = snapToGround(e.x, e.y);
        if (floorY!=null && e.y>=floorY){ e.y=floorY; e.vy=0; }
        break;
      }
      case 'hopper': {
        e.vy=(e.vy||0)+GRAVITY*0.9;
        const floorY = snapToGround(e.x, e.y);
        if (floorY!=null && e.y>=floorY-1){ e.y=floorY; e.vy=-11; }
        e.y += e.vy*0.5;
        break;
      }
      case 'flyer': {
        e.y = e.baseY + Math.sin(e.t*2)*24;
        e.x = e.baseX + Math.sin(e.t*0.7)*e.range;
        break;
      }
      case 'ghost': {
        const dist = player.x - e.x;
        if (Math.abs(dist) < 220){ e.x += Math.sign(dist)*0.8; e.alpha=0.9; } else e.alpha=0.3;
        e.y = e.baseY + Math.sin(e.t*1.5)*16;
        break;
      }
      case 'turret': {
        e.shootT=(e.shootT||0)+1;
        if (e.shootT>110 && Math.abs(player.x-e.x)<400){
          e.shootT=0;
          level.entities.enemies.push({type:'bullet', x:e.x, y:e.y+8, dir: player.x<e.x?-1:1, alive:true, life:180});
        }
        break;
      }
      case 'bullet': {
        e.x += e.dir*5; e.life--; if (e.life<=0) e.alive=false;
        break;
      }
      case 'chaser': {
        e.vy=(e.vy||0)+GRAVITY*0.9; e.vy=Math.min(e.vy,14);
        const dist = player.x-e.x;
        e.dir = Math.abs(dist)<260 ? Math.sign(dist) : e.dir;
        e.x += e.dir*1.8; e.y += e.vy;
        const floorY = snapToGround(e.x, e.y);
        if (floorY!=null && e.y>=floorY){ e.y=floorY; e.vy=0; }
        break;
      }
      case 'piranha': {
        e.y = e.homeY + Math.sin(e.t*1.2)*18 - 18;
        break;
      }
    }
    collideEnemyPlayer(e);
    if (e.x < camX-400) e.alive = (e.type==='piranha'||e.type==='turret');
  }
  level.entities.enemies = level.entities.enemies.filter(e=> e.alive || e.deathTimer>0);
  for (const e of level.entities.enemies){ if(e.deathTimer>0) e.deathTimer--; }

  if (level.boss && level.boss.alive) updateBoss();
}

function groundAheadY(x,y){
  const tx = Math.floor((x+14)/TILE);
  const ty = Math.floor((y+40)/TILE);
  return solidTile(tileAt(tx,ty)) ? ty : null;
}
function snapToGround(x,y){
  const tx = Math.floor((x+14)/TILE);
  for (let ty=Math.floor(y/TILE); ty<level.height; ty++){
    if (solidTile(tileAt(tx,ty))) return ty*TILE-32;
  }
  return null;
}

function collideEnemyPlayer(e){
  if (!e.alive) return;
  const ex=e.x, ey=e.y, ew=28, eh= e.type==='bullet'?16:30;
  const pw=player.w, ph=player.power==='small'?24:34;
  const px=player.x, py=player.y+(player.h-ph);
  if (px<ex+ew && px+pw>ex && py<ey+eh && py+ph>ey){
    if (player.starTime>0){ defeatEnemy(e, true); return; }
    if (e.type==='piranha' || e.type==='turret' || e.type==='bullet'){ hurtByEnemy(e); return; }
    if (player.vy>0 && py+ph-ey < 18){
      defeatEnemy(e,false);
      player.vy = -8.5;
      player.score+=200;
    } else {
      hurtByEnemy(e);
    }
  }
}
function defeatEnemy(e, byStar){
  if (e.type==='koopa' && !byStar && !e.shell){
    e.shell=true; e.dir=0; e.h=16; return;
  }
  e.alive=false; e.deathTimer=20; e.dead=true;
  floatingTexts.push({x:e.x,y:e.y,text:'+200',life:40,vy:-1});
  playSfx('stomp');
}
function hurtByEnemy(e){
  if (e.shell && e.dir===0){ e.dir = player.x<e.x?1:-1; return; }
  if (player.shieldHits>0){ player.shieldHits--; player.invincible=60; if(player.shieldHits<=0) player.power='small'; return; }
  killPlayer();
}

function updateBoss(){
  const b = level.boss;
  b.t = (b.t||0)+1/60;
  b.hitCooldown = Math.max(0,(b.hitCooldown||0)-1);
  b.attackT = (b.attackT||0)+1;
  b.stunT = Math.max(0,(b.stunT||0)-1);

  const hpRatio = b.hp/b.maxHp;
  b.phase = hpRatio>0.66?1:hpRatio>0.33?2:3;

  if (b.stunT>0){
    b.y = (level.groundY-4)*TILE + Math.sin(b.t*6)*4;
  } else {
    const speed = 0.5+b.phase*0.35;
    b.x += Math.sin(b.t*0.8)*speed;
    b.x = Math.max(b.arenaLeft, Math.min(b.arenaRight-64, b.x));
    b.y = (level.groundY-4)*TILE + Math.sin(b.t*1.3)*22;

    const cadence = b.phase===1?150:b.phase===2?110:80;
    if (b.attackT>cadence){
      b.attackT=0;
      const roll = Math.random();
      if (b.phase>=2 && roll<0.4){
        for (let i=0;i<(b.phase===3?3:2);i++){
          setTimeout(()=>{
            if (!b.alive) return;
            level.entities.enemies.push({type:'bullet', x:b.x+20, y:b.y+30, dir: player.x<b.x?-1:1, alive:true, life:200});
          }, i*180);
        }
        playSfx('bossRoar');
      } else if (roll<0.7){
        b.vyBoss=-13; b.jumping=true;
      } else {
        b.dashT=30; b.dashDir = player.x<b.x?-1:1;
      }
    }
  }
  if (b.jumping){
    b.vyBoss=(b.vyBoss||0)+GRAVITY*0.7; b.y+=b.vyBoss;
    const floorY=(level.groundY-4)*TILE;
    if (b.y>=floorY){ b.y=floorY; b.jumping=false; b.vyBoss=0; }
  }
  if (b.dashT>0){
    b.x += b.dashDir*6; b.dashT--;
    b.x = Math.max(b.arenaLeft, Math.min(b.arenaRight-64, b.x));
  }

  const pw=player.w, ph=player.power==='small'?24:34;
  const px=player.x, py=player.y+(player.h-ph);
  const bw=64,bh=64;
  if (px<b.x+bw && px+pw>b.x && py<b.y+bh && py+ph>b.y){
    if (player.starTime>0 && b.hitCooldown===0){ damageBoss(b); }
    else if (player.vy>0 && py+ph-b.y<20 && b.hitCooldown===0){ damageBoss(b); player.vy=-9; }
    else if (b.hitCooldown===0) { hurtByEnemy({}); }
  }
}
function damageBoss(b){
  b.hp--; b.hitCooldown=45; b.stunT=25; playSfx('bossHit');
  floatingTexts.push({x:b.x+20,y:b.y-10,text:'-1',life:30,vy:-1.5});
  if (b.hp<=0){
    b.alive=false;
    floatingTexts.push({x:b.x,y:b.y,text:'BOSS DEFEATED!',life:90,vy:-0.5});
    playSfx('bossDefeat');
    for(let i=0;i<10;i++) particles.push({type:'brick', x:b.x+30,y:b.y+20, vx:(Math.random()-0.5)*10, vy:-4-Math.random()*8, life:50});
  }
}

// ---------- Coins / Powerups ----------
function updatePickups(){
  const pw=player.w, ph=player.power==='small'?24:34;
  const px=player.x, py=player.y+(player.h-ph);
  for (const c of level.entities.coins){
    if (c.collected) continue;
    if (px<c.x+18 && px+pw>c.x-2 && py<c.y+18 && py+ph>c.y-2){
      c.collected=true; player.coins++; player.score+=50; playSfx('coin');
    }
  }
  for (const p of level.entities.powerups){
    if (p.collected) continue;
    if (p.rising>0){ p.y-=1; p.rising--; continue; }
    if (p.vx){ p.x+=p.vx; const fy=snapToGround(p.x,p.y); if(fy!=null){p.vy=(p.vy||0)+GRAVITY*0.8; p.y+=p.vy; if(p.y>=fy){p.y=fy;p.vy=0;}} }
    if (px<p.x+22 && px+pw>p.x-2 && py<p.y+22 && py+ph>p.y-2){
      p.collected=true; applyPowerup(p.type); playSfx('powerup');
    }
  }
}
function applyPowerup(type){
  player.score+=500;
  floatingTexts.push({x:player.x,y:player.y-20,text: type.toUpperCase(), life:50, vy:-1});
  if (type==='mushroom'){ if(player.power==='small') player.power='big'; }
  else if (type==='fireflower'){ player.power='fire'; }
  else if (type==='feather'){ player.power='feather'; }
  else if (type==='shield'){ player.power='shield'; player.shieldHits=1; }
  else if (type==='star'){ player._prevPower=player.power==='star'?player._prevPower:player.power; player.power='star'; player.starTime=600; }
  updatePowerIcon();
}

// ---------- Rendering ----------
function draw(){
  const th = level.theme;
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0, th.sky1); g.addColorStop(1, th.sky2);
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

  ctx.fillStyle = th.hills;
  const hillOff = -(camX*0.25)%400;
  for (let i=-1;i<4;i++){
    const bx = hillOff+i*400;
    ctx.beginPath(); ctx.ellipse(bx+200,H-40,260,120,0,Math.PI,0); ctx.fill();
  }
  if (th.cloud){
    ctx.fillStyle='rgba(255,255,255,0.85)';
    const cloudOff = -(camX*0.4)%500;
    for (let i=-1;i<4;i++){
      const cx=cloudOff+i*500+60, cy=70+((i*53)%40);
      drawCloud(cx,cy);
    }
  }
  ctx.fillStyle = shade(th.hills,-18);
  const midOff = -(camX*0.55)%300;
  for (let i=-1;i<5;i++){
    const bx = midOff+i*300;
    ctx.beginPath(); ctx.ellipse(bx+150,H-10,150,70,0,Math.PI,0); ctx.fill();
  }

  ctx.save();
  ctx.translate(-camX,0);

  const x0 = Math.floor(camX/TILE)-1, x1=Math.ceil((camX+W)/TILE)+1;
  for (let ty=0; ty<level.height; ty++){
    for (let tx=Math.max(0,x0); tx<Math.min(level.width,x1); tx++){
      const v = level.tiles[ty][tx];
      if (v) drawTile(tx,ty,v,th);
    }
  }

  if (level.isBoss) drawArenaDecor(level.arena, th);
  if (!level.isBoss) drawGoal(level.goal.x, level.goal.y);
  if (level.isBoss && level.boss && level.boss.alive) drawBoss(level.boss);
  if (level.isBoss && !level.boss.alive) drawGoal(level.goal.x, level.goal.y);

  for (const c of level.entities.coins) if(!c.collected) drawCoin(c.x,c.y);
  for (const p of level.entities.powerups) if(!p.collected) drawPowerup(p);
  for (const e of level.entities.enemies) if (e.alive || e.deathTimer>0) drawEnemy(e);

  for (const p of particles) drawParticle(p);
  for (const f of floatingTexts) drawFloatText(f);

  drawPlayer();

  ctx.restore();
}

function shade(hex, amt){
  const c = hex.replace('#','');
  const num = parseInt(c,16);
  let r=(num>>16)+amt, g2=((num>>8)&0xff)+amt, b=(num&0xff)+amt;
  r=Math.max(0,Math.min(255,r)); g2=Math.max(0,Math.min(255,g2)); b=Math.max(0,Math.min(255,b));
  return `rgb(${r},${g2},${b})`;
}

function drawCloud(x,y){
  ctx.beginPath();
  ctx.ellipse(x,y,34,18,0,0,Math.PI*2);
  ctx.ellipse(x+28,y+6,26,15,0,0,Math.PI*2);
  ctx.ellipse(x-26,y+8,22,13,0,0,Math.PI*2);
  ctx.fill();
}

function drawTile(tx,ty,v,th){
  const x=tx*TILE, y=ty*TILE;
  ctx.save();
  if (v===1||v===9){
    const grd = ctx.createLinearGradient(x,y,x,y+TILE);
    grd.addColorStop(0, th.groundTop); grd.addColorStop(1, shade(th.ground,-10));
    ctx.fillStyle=grd; ctx.fillRect(x,y,TILE,TILE);
    ctx.fillStyle='rgba(0,0,0,0.18)'; ctx.fillRect(x,y+TILE-6,TILE,6);
    ctx.strokeStyle='rgba(0,0,0,0.12)'; ctx.strokeRect(x+0.5,y+0.5,TILE-1,TILE-1);
  } else if (v===2){
    ctx.fillStyle = shade(th.accent,10);
    ctx.fillRect(x,y,TILE,TILE);
    ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=2;
    ctx.strokeRect(x+2,y+2,TILE-4,TILE/2-3);
    ctx.strokeRect(x+2,y+TILE/2+1,TILE-4,TILE/2-3);
    ctx.fillStyle='rgba(255,255,255,0.15)'; ctx.fillRect(x,y,TILE,4);
  } else if (v===3||v===4){
    const grd=ctx.createLinearGradient(x,y,x,y+TILE);
    grd.addColorStop(0,'#ffd23d'); grd.addColorStop(1,'#e8960a');
    ctx.fillStyle=grd; ctx.fillRect(x,y,TILE,TILE);
    ctx.strokeStyle='rgba(120,70,0,0.6)'; ctx.lineWidth=2; ctx.strokeRect(x+1.5,y+1.5,TILE-3,TILE-3);
    ctx.fillStyle='#7a4a00'; ctx.font='bold 18px Arial';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(v===4?'★':'?', x+TILE/2, y+TILE/2+1);
  } else if (v===5){
    const grd=ctx.createLinearGradient(x,y,x+TILE,y);
    grd.addColorStop(0,shade(th.accent,-20)); grd.addColorStop(0.5,shade(th.accent,20)); grd.addColorStop(1,shade(th.accent,-20));
    ctx.fillStyle=grd; ctx.fillRect(x,y,TILE,TILE);
    ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.strokeRect(x+1,y+1,TILE-2,TILE-2);
  } else if (v===7){
    const grd=ctx.createLinearGradient(x,y,x,y+14);
    grd.addColorStop(0,'#fff'); grd.addColorStop(1,'#c9d8e0');
    ctx.fillStyle=grd; ctx.fillRect(x,y,TILE,14);
    ctx.fillStyle='rgba(120,140,150,0.4)'; ctx.fillRect(x,y+14,TILE,4);
  }
  ctx.restore();
}

function drawGoal(x,y){
  ctx.save();
  ctx.fillStyle='#ccc'; ctx.fillRect(x+14,y,6,level.groundY*TILE-y);
  ctx.fillStyle='#e8342a';
  ctx.beginPath();
  ctx.moveTo(x+20,y+6); ctx.lineTo(x+58,y+18); ctx.lineTo(x+20,y+30);
  ctx.fill();
  ctx.restore();
}

function drawArenaDecor(arena, theme){
  if (!arena) return;
  const flick = Math.sin(performance.now()/120)*0.3+0.7;
  ctx.save();
  ctx.globalAlpha = flick;
  ctx.fillStyle = theme.accent;
  [arena.startX+2, arena.width-2].forEach(px=>{
    const x=px*TILE, y=(level.groundY-6)*TILE;
    ctx.beginPath(); ctx.ellipse(x+16,y-6,10,16,0,0,Math.PI*2); ctx.fill();
  });
  ctx.restore();
  ctx.fillStyle='rgba(255,255,255,0.08)';
  ctx.fillRect(arena.startX*TILE, 0, 4, level.groundY*TILE);
}

function drawBoss(b){
  const phaseColor = b.phase===1?'#4a2a5a':b.phase===2?'#7a2a3a':'#a01a1a';
  const flashHit = b.hitCooldown>30;
  ctx.save();
  ctx.translate(b.x,b.y);
  const scale = 1+(b.maxHp>14?0.15:0);
  ctx.scale(scale,scale);

  ctx.save();
  ctx.globalAlpha = 0.25+b.phase*0.1;
  ctx.fillStyle = phaseColor;
  ctx.beginPath(); ctx.ellipse(32,44,50,46,0,0,Math.PI*2); ctx.fill();
  ctx.restore();

  ctx.fillStyle = flashHit?'#fff':phaseColor;
  ctx.beginPath(); ctx.ellipse(32,40,34,32,0,0,Math.PI*2); ctx.fill();
  if (b.phase>=2){
    ctx.fillStyle = shade(phaseColor,-30);
    for(let i=0;i<5;i++){
      const ang=-Math.PI*0.9+i*0.35;
      ctx.beginPath();
      ctx.moveTo(32+Math.cos(ang)*20,16+Math.sin(ang)*20);
      ctx.lineTo(32+Math.cos(ang)*36,4+Math.sin(ang)*20);
      ctx.lineTo(32+Math.cos(ang+0.15)*20,16+Math.sin(ang+0.15)*20);
      ctx.fill();
    }
  }
  ctx.fillStyle='#fff';
  ctx.beginPath(); ctx.ellipse(18,30,8,10,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(46,30,8,10,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle= b.phase===3?'#ff3a1a':'#000';
  ctx.beginPath(); ctx.arc(18,32,3,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(46,32,3,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#ff5a1a';
  ctx.fillRect(10,54,44,8);
  ctx.restore();

  ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(b.x-14,b.y-30,108,14);
  ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.strokeRect(b.x-14,b.y-30,108,14);
  const barColor = b.phase===1?'#4caf50':b.phase===2?'#ff9800':'#f44336';
  ctx.fillStyle=barColor; ctx.fillRect(b.x-11,b.y-27,Math.max(0,102*(b.hp/b.maxHp)),8);
  ctx.fillStyle='#fff'; ctx.font='bold 10px Arial'; ctx.textAlign='center';
  ctx.fillText(`PHASE ${b.phase}`, b.x+40, b.y-42);
}

function drawCoin(x,y){
  const t = performance.now()/150;
  const sw = Math.abs(Math.sin(t))*14+2;
  ctx.save();
  ctx.translate(x+8,y+8);
  const grd = ctx.createLinearGradient(-sw/2,0,sw/2,0);
  grd.addColorStop(0,'#a86a00'); grd.addColorStop(0.5,'#ffe95a'); grd.addColorStop(1,'#a86a00');
  ctx.fillStyle=grd;
  ctx.fillRect(-sw/2,-10,sw,20);
  ctx.restore();
}

function drawPowerup(p){
  ctx.save();
  ctx.translate(p.x,p.y);
  const bob = Math.sin(performance.now()/200)*3;
  if (p.type==='mushroom'){
    ctx.fillStyle='#e8342a'; ctx.beginPath(); ctx.arc(11,10+bob,11,Math.PI,0); ctx.fill();
    ctx.fillStyle='#f5e6c8'; ctx.fillRect(4,10+bob,14,10);
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(6,6+bob,3,0,Math.PI*2); ctx.arc(17,7+bob,2.5,0,Math.PI*2); ctx.fill();
  } else if (p.type==='fireflower'){
    ctx.fillStyle='#ff7a1a';
    for(let i=0;i<5;i++){ ctx.beginPath(); ctx.arc(11+Math.cos(i*1.26)*8,10+bob+Math.sin(i*1.26)*8,6,0,Math.PI*2); ctx.fill(); }
    ctx.fillStyle='#ffd23d'; ctx.beginPath(); ctx.arc(11,10+bob,6,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#2e7d32'; ctx.fillRect(9,20+bob,4,8);
  } else if (p.type==='star'){
    drawStarShape(11,10+bob,11,'#ffd23d');
  } else if (p.type==='feather'){
    ctx.fillStyle='#8ad8ff';
    ctx.beginPath(); ctx.ellipse(11,10+bob,6,12,0.5,0,Math.PI*2); ctx.fill();
  } else if (p.type==='shield'){
    ctx.fillStyle='#4ac9ff';
    ctx.beginPath(); ctx.moveTo(11,0+bob); ctx.lineTo(22,6+bob); ctx.lineTo(20,18+bob); ctx.lineTo(11,24+bob); ctx.lineTo(2,18+bob); ctx.lineTo(0,6+bob); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function drawStarShape(cx,cy,r,color){
  ctx.fillStyle=color;
  ctx.beginPath();
  for(let i=0;i<10;i++){
    const ang=Math.PI/5*i-Math.PI/2;
    const rad=i%2===0?r:r*0.45;
    const x=cx+Math.cos(ang)*rad, y=cy+Math.sin(ang)*rad;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.closePath(); ctx.fill();
}

function drawEnemy(e){
  ctx.save();
  ctx.globalAlpha = e.alpha!==undefined?e.alpha:1;
  if (e.dead) ctx.globalAlpha *= (e.deathTimer/20);
  const squish = e.dead?0.2:1;
  ctx.translate(e.x+14, e.y+(e.dead?26:14));
  ctx.scale(1,squish);
  switch(e.type){
    case 'goomba':
      ctx.fillStyle='#8a5a3a'; ctx.beginPath(); ctx.ellipse(0,0,14,12,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#5a3a1a'; ctx.fillRect(-12,8,10,6); ctx.fillRect(2,8,10,6);
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(-5,-2,4,0,Math.PI*2); ctx.arc(5,-2,4,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(-5,-1,2,0,Math.PI*2); ctx.arc(5,-1,2,0,Math.PI*2); ctx.fill();
      break;
    case 'koopa':
      ctx.fillStyle='#3ea832';
      ctx.beginPath(); ctx.ellipse(0,e.shell?4:0,14,e.shell?10:16,0,0,Math.PI*2); ctx.fill();
      if(!e.shell){ ctx.fillStyle='#ffe0a3'; ctx.beginPath(); ctx.ellipse(0,-14,7,7,0,0,Math.PI*2); ctx.fill(); }
      break;
    case 'spiky':
      ctx.fillStyle='#c9342a'; ctx.beginPath(); ctx.ellipse(0,0,14,12,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#5a1a1a';
      for(let i=0;i<6;i++){ ctx.beginPath(); const ang=i/6*Math.PI*2; ctx.moveTo(Math.cos(ang)*12,Math.sin(ang)*10); ctx.lineTo(Math.cos(ang)*20,Math.sin(ang)*16); ctx.lineTo(Math.cos(ang+0.3)*12,Math.sin(ang+0.3)*10); ctx.fill(); }
      break;
    case 'flyer':
      ctx.fillStyle='#c94ac9'; ctx.beginPath(); ctx.ellipse(0,0,13,10,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.6)';
      const wf=Math.sin(performance.now()/80)*10;
      ctx.beginPath(); ctx.ellipse(-14,wf,10,5,0.3,0,Math.PI*2); ctx.ellipse(14,-wf,10,5,-0.3,0,Math.PI*2); ctx.fill();
      break;
    case 'hopper':
      ctx.fillStyle='#4ac97a'; ctx.beginPath(); ctx.ellipse(0,0,13,14,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(-4,-3,3,0,Math.PI*2); ctx.arc(4,-3,3,0,Math.PI*2); ctx.fill();
      break;
    case 'turret':
      ctx.fillStyle='#5a5a6a'; ctx.fillRect(-14,-4,28,26);
      ctx.fillStyle='#2a2a3a'; ctx.beginPath(); ctx.arc(0,-4,12,Math.PI,0); ctx.fill();
      ctx.fillStyle='#c9342a'; ctx.beginPath(); ctx.arc(0,-4,4,0,Math.PI*2); ctx.fill();
      break;
    case 'bullet':
      ctx.fillStyle='#2a2a2a'; ctx.beginPath(); ctx.ellipse(0,0,10,8,0,0,Math.PI*2); ctx.fill();
      break;
    case 'chaser':
      ctx.fillStyle='#ff8a3a'; ctx.beginPath(); ctx.ellipse(0,0,14,13,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(-4,-3,4,0,Math.PI*2); ctx.arc(4,-3,4,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#c00'; ctx.beginPath(); ctx.arc(-4,-3,2,0,Math.PI*2); ctx.arc(4,-3,2,0,Math.PI*2); ctx.fill();
      break;
    case 'ghost':
      ctx.fillStyle='rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(0,-2,13,Math.PI,0);
      ctx.lineTo(13,12); for(let i=0;i<4;i++){ ctx.lineTo(13-i*6.5-3,6); ctx.lineTo(13-i*6.5-6,12);} ctx.closePath(); ctx.fill();
      ctx.fillStyle='#333'; ctx.beginPath(); ctx.arc(-5,-2,2.5,0,Math.PI*2); ctx.arc(5,-2,2.5,0,Math.PI*2); ctx.fill();
      break;
    case 'piranha':
      ctx.fillStyle='#2e7d32'; ctx.fillRect(-6,10,12,20);
      ctx.fillStyle='#e8342a'; ctx.beginPath(); ctx.ellipse(0,0,13,14,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff';
      for(let i=0;i<5;i++){ ctx.beginPath(); ctx.moveTo(-10+i*5,-8); ctx.lineTo(-8+i*5,-2); ctx.lineTo(-6+i*5,-8); ctx.fill(); }
      break;
  }
  ctx.restore();
}

function drawParticle(p){
  if (p.type==='coinpop'){
    p.y+=p.vy; p.vy+=0.4; p.life--;
    ctx.fillStyle='#ffe95a'; ctx.fillRect(p.x-4,p.y-8,8,16);
  } else if (p.type==='brick'){
    p.x+=p.vx; p.y+=p.vy; p.vy+=0.5; p.life--;
    ctx.fillStyle='#a85a2a'; ctx.fillRect(p.x-5,p.y-5,10,10);
  }
}
function drawFloatText(f){
  f.y+=f.vy; f.life--;
  ctx.save();
  ctx.globalAlpha = Math.min(1,f.life/20);
  ctx.fillStyle='#fff'; ctx.strokeStyle='#000'; ctx.lineWidth=3;
  ctx.font='bold 16px Arial'; ctx.textAlign='center';
  ctx.strokeText(f.text,f.x+14,f.y);
  ctx.fillText(f.text,f.x+14,f.y);
  ctx.restore();
}

function drawPlayer(){
  const ph = player.crouching?player.h*0.6:(player.power==='small'?player.h*0.72:player.h);
  const py = player.y+(player.h-ph);
  ctx.save();
  if (player.hurtTime>0 && Math.floor(player.hurtTime/4)%2===0) ctx.globalAlpha=0.3;
  if (player.invincible>0 && Math.floor(player.invincible/4)%2===0) ctx.globalAlpha=0.5;
  ctx.translate(player.x+player.w/2, py+ph/2);
  ctx.scale(player.facing,1);

  const colors = {
    small:{body:'#3a7ac9', cap:'#e8342a'},
    big:{body:'#3a7ac9', cap:'#e8342a'},
    fire:{body:'#fff', cap:'#e8342a'},
    star:{body:`hsl(${(performance.now()/5)%360},80%,60%)`, cap:`hsl(${(performance.now()/5+90)%360},80%,50%)`},
    feather:{body:'#3a7ac9', cap:'#8ad8ff'},
    shield:{body:'#3a7ac9', cap:'#4ac9ff'},
  };
  const c = colors[player.power]||colors.small;

  ctx.save(); ctx.globalAlpha*=0.35; ctx.fillStyle='#000';
  ctx.beginPath(); ctx.ellipse(0, ph/2+4, player.w*0.5, 5, 0,0,Math.PI*2); ctx.fill();
  ctx.restore();

  const grdBody = ctx.createLinearGradient(-player.w/2,0,player.w/2,0);
  grdBody.addColorStop(0, shade(c.body,-25)); grdBody.addColorStop(0.5, c.body); grdBody.addColorStop(1, shade(c.body,-25));
  ctx.fillStyle=grdBody;
  roundRect(-player.w/2,-ph/2+8,player.w,ph-8,6); ctx.fill();

  ctx.fillStyle=shade('#2a5a9a',0);
  roundRect(-player.w/2,-ph*0.05,player.w,ph*0.5,4); ctx.fill();

  ctx.fillStyle='#f5c89a';
  ctx.beginPath(); ctx.arc(2,-ph/2+6,player.w*0.32,0,Math.PI*2); ctx.fill();
  const grdCap = ctx.createLinearGradient(0,-ph/2-4,0,-ph/2+8);
  grdCap.addColorStop(0, shade(c.cap,20)); grdCap.addColorStop(1, shade(c.cap,-20));
  ctx.fillStyle=grdCap;
  ctx.beginPath(); ctx.arc(2,-ph/2+2,player.w*0.36,Math.PI,0); ctx.fill();
  ctx.fillRect(-player.w*0.3+2,-ph/2+2,player.w*0.62,4);

  if (player.power==='feather'){
    ctx.fillStyle='#fff';
    ctx.beginPath(); ctx.ellipse(-player.w/2-4,0,10,6,0.3,0,Math.PI*2); ctx.fill();
  }
  if (player.power==='shield' && player.shieldHits>0){
    ctx.strokeStyle='rgba(74,201,255,0.8)'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(0,0,player.w*0.9,0,Math.PI*2); ctx.stroke();
  }
  ctx.restore();
}
function roundRect(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

// ---------- Audio ----------
let actx;
let musicTimer = null;
let musicOn = true;
let sfxOn = true;
let sfxGainNode=null, musicGainNode=null;

function getActx(){
  if(!actx) actx = new (window.AudioContext||window.webkitAudioContext)();
  if (actx.state==='suspended') actx.resume();
  return actx;
}
function tone(freq, start, dur, type='sine', vol=0.09, slideTo=null){
  const ac = getActx();
  const o = ac.createOscillator(); const g = ac.createGain();
  o.connect(g); g.connect(masterGain());
  o.type=type; o.frequency.setValueAtTime(freq, ac.currentTime+start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime+start+dur);
  g.gain.setValueAtTime(0.0001, ac.currentTime+start);
  g.gain.exponentialRampToValueAtTime(vol, ac.currentTime+start+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime+start+dur);
  o.start(ac.currentTime+start); o.stop(ac.currentTime+start+dur+0.02);
}
function masterGain(){
  const ac=getActx();
  if(!sfxGainNode){ sfxGainNode=ac.createGain(); sfxGainNode.gain.value=sfxOn?1:0; sfxGainNode.connect(ac.destination); }
  return sfxGainNode;
}
function musicMaster(){
  const ac=getActx();
  if(!musicGainNode){ musicGainNode=ac.createGain(); musicGainNode.gain.value=musicOn?0.5:0; musicGainNode.connect(ac.destination); }
  return musicGainNode;
}
function playSfx(kind){
  if (!sfxOn) return;
  try{
    switch(kind){
      case 'jump': tone(392,0,0.10,'square',0.08,660); break;
      case 'coin': tone(988,0,0.06,'square',0.09); tone(1568,0.05,0.12,'square',0.08); break;
      case 'stomp': tone(180,0,0.09,'triangle',0.11,90); break;
      case 'powerup': [523,659,784,1047].forEach((f,i)=> tone(f,i*0.07,0.14,'square',0.09)); break;
      case 'hurt': tone(220,0,0.14,'sawtooth',0.1,110); break;
      case 'death': tone(392,0,0.16,'sawtooth',0.1,196); tone(261,0.16,0.16,'sawtooth',0.09,110); tone(174,0.32,0.3,'sawtooth',0.08,60); break;
      case 'win': [523,659,784,1047,1319].forEach((f,i)=> tone(f,i*0.11,0.22,'square',0.09)); break;
      case 'bossHit': tone(150,0,0.1,'square',0.12,70); tone(80,0.05,0.15,'sawtooth',0.1,40); break;
      case 'bossDefeat': [220,196,164,131,98].forEach((f,i)=> tone(f,i*0.16,0.3,'sawtooth',0.11)); break;
      case 'bossRoar': tone(80,0,0.4,'sawtooth',0.14,40); tone(60,0.1,0.5,'square',0.1,30); break;
      case 'pause': tone(440,0,0.05,'sine',0.06); tone(330,0.05,0.08,'sine',0.05); break;
      case 'select': tone(660,0,0.06,'square',0.07); break;
      default: tone(440,0,0.1,'sine',0.08);
    }
  }catch(e){}
}
const MUSIC_SCALES = [
  [261,293,329,392,440],
  [277,311,370,415,466],
  [233,262,311,349,415],
  [246,277,311,370,415],
  [196,220,233,277,311],
];
let musicStepIdx=0;
function startMusic(worldIdx){
  stopMusic();
  if (!musicOn) return;
  const scale = MUSIC_SCALES[worldIdx % MUSIC_SCALES.length];
  musicStepIdx=0;
  const stepDur=0.34;
  function schedule(){
    if (!musicOn) return;
    const ac = getActx();
    const root = scale[0]/2;
    const o1=ac.createOscillator(), g1=ac.createGain();
    o1.type='triangle'; o1.frequency.value=root;
    o1.connect(g1); g1.connect(musicMaster());
    g1.gain.setValueAtTime(0.0001, ac.currentTime);
    g1.gain.exponentialRampToValueAtTime(0.22, ac.currentTime+0.02);
    g1.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime+stepDur*0.9);
    o1.start(); o1.stop(ac.currentTime+stepDur);
    if (musicStepIdx%2===0){
      const note = scale[Math.floor(Math.sin(musicStepIdx*1.7)*2.4+2.4)%scale.length];
      const o2=ac.createOscillator(), g2=ac.createGain();
      o2.type='square'; o2.frequency.value=note;
      o2.connect(g2); g2.connect(musicMaster());
      g2.gain.setValueAtTime(0.0001, ac.currentTime);
      g2.gain.exponentialRampToValueAtTime(0.09, ac.currentTime+0.01);
      g2.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime+stepDur*0.7);
      o2.start(); o2.stop(ac.currentTime+stepDur*0.7);
    }
    musicStepIdx++;
    musicTimer = setTimeout(schedule, stepDur*1000);
  }
  schedule();
}
function stopMusic(){ if (musicTimer) clearTimeout(musicTimer); musicTimer=null; }
function toggleMusic(){ musicOn=!musicOn; if(musicGainNode) musicGainNode.gain.value=musicOn?0.5:0; if(musicOn && state==='playing') startMusic(level.worldNum-1); else stopMusic(); }
function toggleSfx(){ sfxOn=!sfxOn; if(sfxGainNode) sfxGainNode.gain.value=sfxOn?1:0; }

// ---------- Main loop ----------
function updateHUD(){
  document.getElementById('coinCount').textContent = `🪙 x${player.coins}`;
  document.getElementById('timeLabel').textContent = `⏱ ${Math.max(0,Math.ceil(timeLeft))}`;
  updatePowerIcon();
}

let lastT = performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const dt = Math.min(3, (now-lastT)/16.67);
  lastT = now;
  if (state==='playing'){
    timeLeft -= dt/60;
    if (timeLeft<=0){ timeLeft=0; killPlayer(); }
    updatePlayer();
    updateEnemies();
    updatePickups();
    particles = particles.filter(p=>p.life>0);
    floatingTexts = floatingTexts.filter(f=>f.life>0);
    updateHUD();
  }
  if (state==='playing' || state==='paused'){
    draw();
  }
}
requestAnimationFrame(loop);
showScreen('titleScreen');

let resizeDebounce=null;
window.addEventListener('resize', () => {
  clearTimeout(resizeDebounce);
  resizeDebounce = setTimeout(() => {
    const newSize = computeCanvasSize();
    if (newSize.w !== canvas.width || newSize.h !== canvas.height){
      canvas.width = newSize.w;
      canvas.height = newSize.h;
      W = canvas.width; H = canvas.height;
      if (state==='playing' || state==='paused') draw();
    }
  }, 150);
});
