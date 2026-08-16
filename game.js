// ============================================================
// SUPER ABEL 123 WORLD — GAME ENGINE
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
  unlockedLevel = parseInt(localStorage.getItem('abel_unlocked')||'0');
  levelStars = JSON.parse(localStorage.getItem('abel_stars')||'{}');
} catch(e){}
function saveProgress(){
  try{
    localStorage.setItem('abel_unlocked', String(unlockedLevel));
    localStorage.setItem('abel_stars', JSON.stringify(levelStars));
  }catch(e){}
}

const keys = {};
window.addEventListener('keydown', e=>{
  keys[e.code]=true;
  if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","KeyE"].includes(e.code)) e.preventDefault();
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
bindTouch('btnGrab','KeyE');

let state = 'title';
let currentLevelIndex = 0;
let level = null;
let camX = 0;
let particles = [];
let floatingTexts = [];

const player = {
  x:0,y:0,w:26,h:34,vx:0,vy:0,
  onGround:false, facing:1,
  invincible:0, hearts:3, maxHearts:3, gems:0, score:0,
  hurtTime:0, crouching:false,
  carrying:null,
  grabLock:false, speedTime:0,
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
  level.entities.enemies.forEach(e=>{
    e.alive=true; e.dir=-1; e.vy=0; e.baseX=e.x; e.baseY=e.y; e.t=Math.random()*100;
    e.stunned=0; e.held=false;
    e.hp = e.type==='shellback' ? 2 : 1;
  });
  level.entities.gems.forEach(c=> c.collected=false);
  level.entities.powerups.forEach(p=> p.collected=false);
  level.entities.pullSpots.forEach(p=>{ p.used=false; p.respawnT=0; });
  level.boss = level.boss ? {...level.boss, alive:true, hitCooldown:0} : null;

  player.x = 2*TILE; player.y = (level.groundY-3)*TILE;
  player.vx=0; player.vy=0; player.onGround=false; player.facing=1;
  player.invincible=90; player.hurtTime=0; player.hearts=3; player.maxHearts=3;
  player.gems=0; player.carrying=null; player.speedTime=0;
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
  updateHUDStatic();
  try { startMusic(level.worldNum-1); } catch(e){}
  if (level.isBoss) setTimeout(()=>{ playSfx('bossRoar'); showMsg(level.boss.name, 2200); }, 900);
  draw();
}

function showMsg(txt, ms){
  const el = document.getElementById('msgOverlay');
  el.textContent = txt;
  el.style.opacity = 1;
  clearTimeout(el._t);
  el._t = setTimeout(()=> el.style.opacity=0, ms);
}

function updateHUDStatic(){
  const hearts = document.getElementById('hearts');
  hearts.textContent = '❤️'.repeat(player.hearts) + '🖤'.repeat(Math.max(0,player.maxHearts-player.hearts));
  const carry = document.getElementById('carryLabel');
  const carryNames = {carrot:'🥕',rock:'🪨',bomb:'💣',goldturnip:'⭐',icechunk:'🧊'};
  carry.textContent = player.carrying ? `Carrying: ${carryNames[player.carrying.type]||''}` : '';
}

// ---------- Physics ----------
const GRAVITY = 0.62;
const MOVE_ACC = 0.6;
const MAX_SPEED = 4.4;
const FRICTION = 0.72;
const JUMP_V = -12.2;
const JUMP_HOLD = 0.40;

function tileAt(tx,ty){
  if (ty<0||ty>=level.height||tx<0||tx>=level.width) return 0;
  return level.tiles[ty][tx];
}
function solidTile(v){ return v===1||v===2||v===9; }

function rectVsTiles(px,py,pw,ph, callback){
  const x0=Math.floor(px/TILE), x1=Math.floor((px+pw)/TILE);
  const y0=Math.floor(py/TILE), y1=Math.floor((py+ph)/TILE);
  for(let ty=y0;ty<=y1;ty++) for(let tx=x0;tx<=x1;tx++){
    const v = tileAt(tx,ty);
    if (v) callback(tx,ty,v);
  }
}

// ---------- Player update ----------
function updatePlayer(){
  const left = keys['ArrowLeft']||keys['KeyA'];
  const right = keys['ArrowRight']||keys['KeyD'];
  const jumpKey = keys['Space']||keys['ArrowUp']||keys['KeyW'];
  const downKey = keys['ArrowDown']||keys['KeyS'];
  const grabKey = keys['KeyE'];

  const topSpeed = MAX_SPEED * (player.speedTime>0?1.5:1);
  if (left && !right){ player.vx -= MOVE_ACC; player.facing=-1; }
  else if (right && !left){ player.vx += MOVE_ACC; player.facing=1; }
  else { player.vx *= FRICTION; if (Math.abs(player.vx)<0.05) player.vx=0; }
  player.vx = Math.max(-topSpeed, Math.min(topSpeed, player.vx));

  player.crouching = downKey && player.onGround;

  if (jumpKey && player.onGround && !player.jumpLock){
    player.vy = JUMP_V;
    player.onGround=false;
    player.jumpHeld = true;
    player.jumpLock = true;
    playSfx('jump');
  }
  if (!jumpKey) { player.jumpHeld=false; player.jumpLock=false; }
  if (player.jumpHeld && player.vy<0) player.vy -= JUMP_HOLD;

  if (grabKey && !player.grabLock){
    player.grabLock = true;
    if (player.carrying){
      throwItem();
    } else {
      tryGrab();
    }
  }
  if (!grabKey) player.grabLock = false;

  player.vy += GRAVITY;
  if (player.vy>16) player.vy=16;

  const speed = player.crouching ? player.vx*0.3 : player.vx;
  let nx = player.x + speed;
  const pw = player.w, ph = player.crouching? player.h*0.6: player.h;
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
      if (solidTile(v)){
        if (v===2 && player.carrying && player.carrying.type==='rock'){
          level.tiles[ty][tx]=0; spawnBrickBits(tx*TILE,ty*TILE); player.score+=50;
        } else {
          ny = (ty+1)*TILE; player.vy=1;
        }
      }
    });
  }
  player.y = ny;

  if (player.y > level.height*TILE + 100) hurtPlayer(true);
  if (player.x<0) player.x=0;
  if (player.x > level.width*TILE - pw) player.x = level.width*TILE-pw;

  if (player.invincible>0) player.invincible--;
  if (player.hurtTime>0) player.hurtTime--;
  if (player.speedTime>0) player.speedTime--;

  const targetCam = player.x - W*0.4;
  camX += (targetCam-camX)*0.15;
  camX = Math.max(0, Math.min(level.width*TILE - W, camX));

  if (player.x > level.goal.x && !level.isBoss){ winLevel(); }
  if (level.isBoss && level.boss && !level.boss.alive && player.x > level.boss.x){ winLevel(); }
}

function tryGrab(){
  const pw=player.w;
  for (const spot of level.entities.pullSpots){
    if (spot.used) continue;
    if (Math.abs((spot.x+16)-(player.x+pw/2)) < 34 && player.onGround){
      spot.used = true;
      spot.respawnT = 480;
      player.carrying = {type: spot.type};
      floatingTexts.push({x:player.x,y:player.y-10,text:'Pulled!',life:30,vy:-1});
      playSfx('pull');
      updateHUDStatic();
      return;
    }
  }
  for (const e of level.entities.enemies){
    if (!e.alive || e.stunned<=0 || e.held) continue;
    if (Math.abs((e.x+14)-(player.x+pw/2)) < 34){
      e.held = true;
      player.carrying = {type:'enemy', enemyRef:e};
      playSfx('pull');
      updateHUDStatic();
      return;
    }
  }
}

function throwItem(){
  const item = player.carrying;
  player.carrying = null;
  const dir = player.facing;
  const tx = player.x + (dir>0?player.w:-6);
  const ty = player.y + player.h*0.35;
  if (item.type==='enemy'){
    const e = item.enemyRef;
    if (e && e.alive){
      e.held=false; e.thrown=true; e.vx=dir*9; e.vy=-4; e.stunned=90;
    }
  } else {
    level.entities.enemies.push({
      type:'projectile', subtype:item.type,
      x:tx, y:ty, vx:dir*10, vy: item.type==='bomb'?-3:-2,
      alive:true, life: item.type==='bomb'?70:120, dir
    });
  }
  playSfx('throw');
  updateHUDStatic();
}

function spawnBrickBits(x,y){
  for(let i=0;i<4;i++) particles.push({type:'brick', x:x+16,y:y+16, vx:(Math.random()-0.5)*6, vy:-6-Math.random()*3, life:40});
}

function hurtPlayer(instantKill){
  if (player.hurtTime>0 || player.invincible>200) return;
  if (!instantKill && player.hearts>1){
    player.hearts--; player.invincible=90; player.hurtTime=60;
    floatingTexts.push({x:player.x,y:player.y,text:'Ouch!',life:40,vy:-1});
    playSfx('hurt');
    updateHUDStatic();
    return;
  }
  player.hearts=0;
  playSfx('death');
  loseLevel();
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
  document.getElementById('winStats').innerHTML = `Gems: ${player.gems} 💎 &nbsp;|&nbsp; Score: ${player.score} &nbsp;|&nbsp; ${'⭐'.repeat(stars)}`;
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

    if (e.held){ continue; }

    if (e.thrown){
      e.vy += GRAVITY*0.9;
      e.x += e.vx; e.y += e.vy;
      const floorY = snapToGround(e.x,e.y);
      if (floorY!=null && e.y>=floorY){ e.y=floorY; e.vx*=0.5; e.vy=0; if(Math.abs(e.vx)<0.3) e.thrown=false; }
      checkThrownEnemyHits(e);
      continue;
    }

    if (e.stunned>0){ e.stunned--; continue; }
    if (e.frozenT>0){ e.frozenT--; continue; }

    switch(e.type){
      case 'grounder': {
        e.vy=(e.vy||0)+GRAVITY*0.9; e.vy=Math.min(e.vy,14);
        let nx = e.x + e.dir*1.1;
        const gY = groundAheadY(nx, e.y);
        if (gY==null) e.dir*=-1;
        e.x += e.dir*1.1; e.y += e.vy;
        const floorY = snapToGround(e.x, e.y);
        if (floorY!=null && e.y>=floorY){ e.y=floorY; e.vy=0; }
        break;
      }
      case 'shellback': {
        e.vy=(e.vy||0)+GRAVITY*0.9; e.vy=Math.min(e.vy,14);
        let nx = e.x + e.dir*0.7;
        const gY = groundAheadY(nx, e.y);
        if (gY==null) e.dir*=-1;
        e.x += e.dir*0.7; e.y += e.vy;
        const floorY = snapToGround(e.x, e.y);
        if (floorY!=null && e.y>=floorY){ e.y=floorY; e.vy=0; }
        break;
      }
      case 'floater': {
        e.baseX = e.baseX!=null?e.baseX:e.x; e.baseY = e.baseY!=null?e.baseY:e.y;
        e.x = e.baseX + Math.sin(e.t*0.8)*(e.range||70);
        e.y = e.baseY + Math.sin(e.t*1.6)*18;
        break;
      }
      case 'digger': {
        e.digT = (e.digT||0)+1;
        e.up = (e.digT%180) > 60;
        e.y = e.up ? e.holeY : e.holeY+24;
        break;
      }
      case 'sentry': {
        e.shootT=(e.shootT||0)+1;
        if (e.shootT>130 && Math.abs(player.x-e.x)<380){
          e.shootT=0;
          level.entities.enemies.push({type:'seed', x:e.x, y:e.y+4, dir: player.x<e.x?-1:1, alive:true, life:160});
        }
        break;
      }
      case 'seed': {
        e.x += e.dir*4.5; e.life--; if (e.life<=0) e.alive=false;
        break;
      }
      case 'projectile': {
        e.vy += GRAVITY*0.85;
        e.x += e.vx; e.y += e.vy;
        e.vx *= 0.995;
        e.life--;
        const floorY = snapToGround(e.x,e.y);
        if (floorY!=null && e.y>=floorY){
          e.y=floorY;
          if (e.subtype==='bomb' && !e.exploded){ explodeBomb(e); e.exploded=true; e.alive=false; }
          else { e.vx*=0.4; e.vy=-Math.abs(e.vy)*0.3; if (Math.abs(e.vx)<0.3 && Math.abs(e.vy)<1) e.settled=true; }
        }
        if (e.life<=0) e.alive=false;
        checkProjectileHits(e);
        break;
      }
    }
    collideEnemyPlayer(e);
    if (e.x < camX-400 && e.type!=='sentry') e.alive = false;
  }
  level.entities.enemies = level.entities.enemies.filter(e=> e.alive || e.deathTimer>0);
  for (const e of level.entities.enemies){ if(e.deathTimer>0) e.deathTimer--; }

  for (const spot of level.entities.pullSpots){
    if (spot.used){ spot.respawnT--; if (spot.respawnT<=0) spot.used=false; }
  }

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

function explodeBomb(bomb){
  playSfx('explode');
  particles.push({type:'boom', x:bomb.x, y:bomb.y, life:20});
  for (const other of level.entities.enemies){
    if (!other.alive || other===bomb) continue;
    if (Math.abs(other.x-bomb.x)<70 && Math.abs(other.y-bomb.y)<70){
      defeatEnemy(other);
    }
  }
  if (Math.abs(player.x-bomb.x)<70 && Math.abs(player.y-bomb.y)<70) hurtPlayer(false);
}

function checkProjectileHits(proj){
  if (!proj.alive) return;
  for (const other of level.entities.enemies){
    if (other===proj || !other.alive || other.type==='projectile' || other.type==='seed') continue;
    if (Math.abs(other.x-proj.x)<24 && Math.abs(other.y-proj.y)<24){
      if (proj.subtype==='bomb'){ explodeBomb(proj); proj.alive=false; return; }
      if (proj.subtype==='rock' || other.hp<=1){
        defeatEnemy(other);
      } else {
        other.hp--; other.stunned = proj.subtype==='icechunk' ? 200 : 100;
        if (proj.subtype==='icechunk') other.frozenT = 200;
        floatingTexts.push({x:other.x,y:other.y,text:'Stunned!',life:30,vy:-1});
      }
      proj.alive=false;
      return;
    }
  }
}
function checkThrownEnemyHits(thrownE){
  for (const other of level.entities.enemies){
    if (other===thrownE || !other.alive || other.held) continue;
    if (Math.abs(other.x-thrownE.x)<26 && Math.abs(other.y-thrownE.y)<26){
      defeatEnemy(other);
      defeatEnemy(thrownE);
      return;
    }
  }
}

function collideEnemyPlayer(e){
  if (!e.alive || e.held) return;
  const ex=e.x, ey=e.y, ew=28, eh=e.type==='seed'?14:30;
  const pw=player.w, ph=player.h;
  const px=player.x, py=player.y+(player.h-ph);
  if (px<ex+ew && px+pw>ex && py<ey+eh && py+ph>ey){
    if (e.type==='seed' || e.type==='projectile'){
      hurtPlayer(false);
      return;
    }
    if (e.stunned>0 || e.thrown){ return; }
    hurtPlayer(false);
  }
}
function defeatEnemy(e){
  e.alive=false; e.deathTimer=20; e.dead=true;
  floatingTexts.push({x:e.x,y:e.y,text:'+200',life:40,vy:-1});
  player.score+=200;
  playSfx('defeat');
}

function updateBoss(){
  const b = level.boss;
  b.t = (b.t||0)+1/60;
  b.hitCooldown = Math.max(0,(b.hitCooldown||0)-1);
  b.attackT = (b.attackT||0)+1;
  b.stunT = Math.max(0,(b.stunT||0)-1);
  b.exposed = b.stunT>0;

  const hpRatio = b.hp/b.maxHp;
  b.phase = hpRatio>0.66?1:hpRatio>0.33?2:3;

  if (!b.exposed){
    const speed = 0.5+b.phase*0.35;
    b.x += Math.sin(b.t*0.8)*speed;
    b.x = Math.max(b.arenaLeft, Math.min(b.arenaRight-64, b.x));
    b.y = (level.groundY-4)*TILE + Math.sin(b.t*1.3)*18;

    const cadence = b.phase===1?140:b.phase===2?100:75;
    if (b.attackT>cadence){
      b.attackT=0;
      const roll = Math.random();
      if (roll<0.5){
        for (let i=0;i<(b.phase===3?3:2);i++){
          setTimeout(()=>{
            if (!b.alive) return;
            level.entities.enemies.push({type:'seed', x:b.x+20, y:b.y+30, dir: player.x<b.x?-1:1, alive:true, life:200});
          }, i*180);
        }
      } else {
        b.dashT=30; b.dashDir = player.x<b.x?-1:1;
      }
    }
  } else {
    b.y = (level.groundY-4)*TILE + Math.sin(b.t*6)*4;
  }
  if (b.dashT>0){
    b.x += b.dashDir*6; b.dashT--;
    b.x = Math.max(b.arenaLeft, Math.min(b.arenaRight-64, b.x));
  }

  for (const e of level.entities.enemies){
    if (!e.alive) continue;
    if ((e.type==='projectile' || e.thrown) && Math.abs(e.x-b.x)<50 && Math.abs(e.y-b.y)<50){
      if (!b.exposed && b.hitCooldown===0){
        b.stunT = 110; b.hitCooldown=20;
        floatingTexts.push({x:b.x,y:b.y-20,text:'STUNNED!',life:40,vy:-1});
        playSfx('bossHit');
      }
      e.alive=false;
    }
  }

  const pw=player.w, ph=player.h;
  const px=player.x, py=player.y+(player.h-ph);
  const bw=64,bh=64;
  if (px<b.x+bw && px+pw>b.x && py<b.y+bh && py+ph>b.y){
    if (b.exposed && b.hitCooldown===0){ damageBoss(b); }
    else if (!b.exposed && b.hitCooldown===0) { hurtPlayer(false); }
  }
}
function damageBoss(b){
  b.hp--; b.hitCooldown=45; b.stunT=Math.max(20,b.stunT-30); playSfx('bossHit');
  floatingTexts.push({x:b.x+20,y:b.y-10,text:'-1',life:30,vy:-1.5});
  if (b.hp<=0){
    b.alive=false;
    floatingTexts.push({x:b.x,y:b.y,text:'BOSS DEFEATED!',life:90,vy:-0.5});
    playSfx('bossDefeat');
    for(let i=0;i<10;i++) particles.push({type:'brick', x:b.x+30,y:b.y+20, vx:(Math.random()-0.5)*10, vy:-4-Math.random()*8, life:50});
  }
}

// ---------- Gems / Powerups ----------
function updatePickups(){
  const pw=player.w, ph=player.h;
  const px=player.x, py=player.y+(player.h-ph);
  for (const c of level.entities.gems){
    if (c.collected) continue;
    if (px<c.x+18 && px+pw>c.x-2 && py<c.y+18 && py+ph>c.y-2){
      c.collected=true; player.gems++; player.score+=50; playSfx('gem');
    }
  }
  for (const p of level.entities.powerups){
    if (p.collected) continue;
    if (px<p.x+22 && px+pw>p.x-2 && py<p.y+22 && py+ph>p.y-2){
      p.collected=true; applyPowerup(p.type); playSfx('powerup');
    }
  }
}
function applyPowerup(type){
  player.score+=300;
  floatingTexts.push({x:player.x,y:player.y-20,text: type==='heart'?'+1 HEART':'SPEED UP!', life:50, vy:-1});
  if (type==='heart'){ player.maxHearts = Math.min(5,player.maxHearts+1); player.hearts = Math.min(player.maxHearts, player.hearts+1); }
  else if (type==='speedberry'){ player.speedTime = 400; }
  updateHUDStatic();
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
    ctx.fillStyle='rgba(255,255,255,0.8)';
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

  for (const spot of level.entities.pullSpots) if(!spot.used) drawPullSpot(spot);

  if (level.isBoss) drawArenaDecor(level.arena, th);
  if (!level.isBoss) drawGoal(level.goal.x, level.goal.y);
  if (level.isBoss && level.boss && level.boss.alive) drawBoss(level.boss);
  if (level.isBoss && !level.boss.alive) drawGoal(level.goal.x, level.goal.y);

  for (const c of level.entities.gems) if(!c.collected) drawGem(c.x,c.y);
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
  } else if (v===7){
    const grd=ctx.createLinearGradient(x,y,x,y+14);
    grd.addColorStop(0,'#fff'); grd.addColorStop(1,'#c9d8e0');
    ctx.fillStyle=grd; ctx.fillRect(x,y,TILE,14);
    ctx.fillStyle='rgba(120,140,150,0.4)'; ctx.fillRect(x,y+14,TILE,4);
  }
  ctx.restore();
}

function drawPullSpot(spot){
  const flick = Math.sin(performance.now()/180)*0.3+0.7;
  ctx.save();
  ctx.globalAlpha = flick;
  const colors = {carrot:'#ff8a1a',rock:'#9a9a9a',bomb:'#2a2a2a',goldturnip:'#ffd23d',icechunk:'#8adcff'};
  ctx.fillStyle = colors[spot.type]||'#ffd23d';
  ctx.beginPath(); ctx.ellipse(spot.x+16, spot.y+30, 14, 6, 0, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.translate(spot.x+16, spot.y+18);
  drawPullIcon(spot.type);
  ctx.restore();
}
function drawPullIcon(type){
  if (type==='carrot'){
    ctx.fillStyle='#ff8a1a';
    ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(6,10); ctx.lineTo(-6,10); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#2e8d47'; ctx.fillRect(-2,-16,4,8);
  } else if (type==='rock'){
    ctx.fillStyle='#9a9a9a';
    ctx.beginPath(); ctx.moveTo(-10,4); ctx.lineTo(-4,-8); ctx.lineTo(6,-8); ctx.lineTo(10,4); ctx.lineTo(4,10); ctx.lineTo(-6,10); ctx.closePath(); ctx.fill();
  } else if (type==='bomb'){
    ctx.fillStyle='#2a2a2a'; ctx.beginPath(); ctx.arc(0,2,9,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#ff8a1a'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(4,-6); ctx.lineTo(8,-14); ctx.stroke();
  } else if (type==='goldturnip'){
    ctx.fillStyle='#ffd23d'; ctx.beginPath(); ctx.ellipse(0,2,9,11,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#2e8d47'; ctx.fillRect(-2,-12,4,8);
  } else if (type==='icechunk'){
    ctx.fillStyle='#8adcff'; ctx.beginPath();
    for(let i=0;i<6;i++){ const ang=i/6*Math.PI*2; const x=Math.cos(ang)*9, y=Math.sin(ang)*9; if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
    ctx.closePath(); ctx.fill();
  }
}

function drawGoal(x,y){
  ctx.save();
  ctx.fillStyle='#ccc'; ctx.fillRect(x+14,y,6,level.groundY*TILE-y);
  ctx.fillStyle='#5adc6a';
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
  const flashHit = b.hitCooldown>30;
  const exposed = b.exposed;
  ctx.save();
  ctx.translate(b.x,b.y);

  const auraColors = ['#4a8a2a','#8a5a1a','#2a6a4a','#2a6a9a','#c9421a'];
  const phaseColor = shade(auraColors[b.bossIdx], b.phase===1?0:b.phase===2?-15:-30);

  ctx.save();
  ctx.globalAlpha = 0.25+b.phase*0.1;
  ctx.fillStyle = exposed ? '#ffe95a' : phaseColor;
  ctx.beginPath(); ctx.ellipse(32,44,50,46,0,0,Math.PI*2); ctx.fill();
  ctx.restore();

  ctx.fillStyle = flashHit?'#fff':(exposed?shade(phaseColor,40):phaseColor);
  ctx.beginPath(); ctx.ellipse(32,40,36,32,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#fff';
  ctx.beginPath(); ctx.ellipse(18,30,8,10,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(46,30,8,10,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle= exposed?'#ffd23d':'#000';
  ctx.beginPath(); ctx.arc(18,32,3,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(46,32,3,0,Math.PI*2); ctx.fill();
  if (exposed){
    ctx.strokeStyle='#fff'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(10,50); ctx.lineTo(54,50); ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(b.x-14,b.y-32,112,16);
  ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.strokeRect(b.x-14,b.y-32,112,16);
  const barColor = exposed? '#ffd23d' : (b.phase===1?'#4caf50':b.phase===2?'#ff9800':'#f44336');
  ctx.fillStyle=barColor; ctx.fillRect(b.x-11,b.y-29,Math.max(0,106*(b.hp/b.maxHp)),10);
  ctx.fillStyle='#fff'; ctx.font='bold 9px Arial'; ctx.textAlign='center';
  ctx.fillText(b.name.toUpperCase(), b.x+42, b.y-44);
  ctx.fillText(exposed?'VULNERABLE!':`PHASE ${b.phase}`, b.x+42, b.y-6);
}

function drawGem(x,y){
  const t = performance.now()/150;
  ctx.save();
  ctx.translate(x+8,y+8);
  ctx.rotate(Math.sin(t)*0.3);
  ctx.fillStyle='#5adc6a';
  ctx.beginPath();
  ctx.moveTo(0,-10); ctx.lineTo(8,-2); ctx.lineTo(5,10); ctx.lineTo(-5,10); ctx.lineTo(-8,-2); ctx.closePath();
  ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(3,-2); ctx.lineTo(-3,-2); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawPowerup(p){
  ctx.save();
  ctx.translate(p.x,p.y);
  const bob = Math.sin(performance.now()/200)*3;
  if (p.type==='heart'){
    ctx.fillStyle='#ff4a6a';
    ctx.beginPath();
    ctx.moveTo(11,4+bob);
    ctx.bezierCurveTo(11,0+bob,4,-4+bob,4,3+bob);
    ctx.bezierCurveTo(4,8+bob,11,14+bob,11,18+bob);
    ctx.bezierCurveTo(11,14+bob,18,8+bob,18,3+bob);
    ctx.bezierCurveTo(18,-4+bob,11,0+bob,11,4+bob);
    ctx.fill();
  } else if (p.type==='speedberry'){
    ctx.fillStyle='#3ad0ff';
    ctx.beginPath(); ctx.arc(11,10+bob,9,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#fff'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(4,10+bob); ctx.lineTo(18,10+bob); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(11,3+bob); ctx.lineTo(11,17+bob); ctx.stroke();
  }
  ctx.restore();
}

function drawEnemy(e){
  if (e.held) return;
  ctx.save();
  ctx.globalAlpha = 1;
  if (e.dead) ctx.globalAlpha *= (e.deathTimer/20);
  const squish = e.dead?0.2:1;
  ctx.translate(e.x+14, e.y+(e.dead?26:14));
  ctx.scale(1,squish);

  const isStunned = e.stunned>0 && e.type!=='projectile' && e.type!=='seed';
  if (isStunned){
    ctx.save();
    ctx.rotate(Math.sin(performance.now()/80)*0.15);
  }

  switch(e.type){
    case 'grounder':
      ctx.fillStyle='#8a6a3a'; ctx.beginPath(); ctx.ellipse(0,0,14,12,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(-5,-2,4,0,Math.PI*2); ctx.arc(5,-2,4,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(-5,-1,2,0,Math.PI*2); ctx.arc(5,-1,2,0,Math.PI*2); ctx.fill();
      break;
    case 'shellback':
      ctx.fillStyle='#4a7a3a'; ctx.beginPath(); ctx.ellipse(0,2,15,11,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='#2a4a1a'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(-10,2); ctx.lineTo(10,2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6,-6); ctx.lineTo(-6,10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6,-6); ctx.lineTo(6,10); ctx.stroke();
      ctx.fillStyle='#ffe0a3'; ctx.beginPath(); ctx.ellipse(0,-12,6,6,0,0,Math.PI*2); ctx.fill();
      break;
    case 'floater':
      ctx.fillStyle='#c94ac9'; ctx.beginPath(); ctx.ellipse(0,0,13,10,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.6)';
      const wf=Math.sin(performance.now()/80)*10;
      ctx.beginPath(); ctx.ellipse(-14,wf,10,5,0.3,0,Math.PI*2); ctx.ellipse(14,-wf,10,5,-0.3,0,Math.PI*2); ctx.fill();
      break;
    case 'digger':
      if (e.up){
        ctx.fillStyle='#9a5a2a'; ctx.beginPath(); ctx.ellipse(0,0,12,12,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(-4,-2,3,0,Math.PI*2); ctx.arc(4,-2,3,0,Math.PI*2); ctx.fill();
      } else {
        ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(0,10,12,4,0,0,Math.PI*2); ctx.fill();
      }
      break;
    case 'sentry':
      ctx.fillStyle='#6a5a4a'; ctx.beginPath(); ctx.ellipse(0,4,13,14,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#3a2a1a'; ctx.beginPath(); ctx.arc(0,-6,7,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#ff8a1a'; ctx.beginPath(); ctx.arc(0,-6,3,0,Math.PI*2); ctx.fill();
      break;
    case 'seed':
      ctx.fillStyle='#3a8a2a'; ctx.beginPath(); ctx.ellipse(0,0,6,5,0,0,Math.PI*2); ctx.fill();
      break;
    case 'projectile':
      drawPullIcon(e.subtype);
      break;
  }
  if (isStunned) ctx.restore();

  if (e.frozenT>0){
    ctx.fillStyle='rgba(160,220,255,0.55)';
    ctx.strokeStyle='rgba(255,255,255,0.8)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.ellipse(0,0,17,17,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
  }
  if (isStunned){
    ctx.fillStyle='#fff'; ctx.font='bold 14px Arial'; ctx.textAlign='center';
    ctx.fillText('★', 0, -22);
  }
  ctx.restore();
}

function drawParticle(p){
  if (p.type==='brick'){
    p.x+=p.vx; p.y+=p.vy; p.vy+=0.5; p.life--;
    ctx.fillStyle='#a85a2a'; ctx.fillRect(p.x-5,p.y-5,10,10);
  } else if (p.type==='boom'){
    p.life--;
    const r = (20-p.life)*3;
    ctx.save(); ctx.globalAlpha = p.life/20;
    ctx.fillStyle='#ff8a1a'; ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2); ctx.fill();
    ctx.restore();
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
  const ph = player.crouching? player.h*0.6 : player.h;
  const py = player.y+(player.h-ph);
  ctx.save();
  if (player.hurtTime>0 && Math.floor(player.hurtTime/4)%2===0) ctx.globalAlpha=0.3;
  if (player.invincible>0 && Math.floor(player.invincible/4)%2===0) ctx.globalAlpha=0.5;
  ctx.translate(player.x+player.w/2, py+ph/2);
  ctx.scale(player.facing,1);

  ctx.save(); ctx.globalAlpha*=0.35; ctx.fillStyle='#000';
  ctx.beginPath(); ctx.ellipse(0, ph/2+4, player.w*0.5, 5, 0,0,Math.PI*2); ctx.fill();
  ctx.restore();

  const bodyColor = '#3aab5a';
  const grdBody = ctx.createLinearGradient(-player.w/2,0,player.w/2,0);
  grdBody.addColorStop(0, shade(bodyColor,-25)); grdBody.addColorStop(0.5, bodyColor); grdBody.addColorStop(1, shade(bodyColor,-25));
  ctx.fillStyle=grdBody;
  roundRect(-player.w/2,-ph/2+8,player.w,ph-8,6); ctx.fill();

  ctx.fillStyle='#8a5a2a';
  roundRect(-player.w/2,-ph*0.05,player.w,ph*0.5,4); ctx.fill();

  ctx.fillStyle='#f5c89a';
  ctx.beginPath(); ctx.arc(2,-ph/2+6,player.w*0.32,0,Math.PI*2); ctx.fill();
  const grdCap = ctx.createLinearGradient(0,-ph/2-4,0,-ph/2+8);
  grdCap.addColorStop(0, shade('#ff8a1a',20)); grdCap.addColorStop(1, shade('#ff8a1a',-20));
  ctx.fillStyle=grdCap;
  ctx.beginPath(); ctx.arc(2,-ph/2+2,player.w*0.36,Math.PI,0); ctx.fill();
  ctx.fillRect(-player.w*0.3+2,-ph/2+2,player.w*0.62,4);

  if (player.carrying){
    ctx.save();
    ctx.translate(0,-ph/2-14);
    if (player.carrying.type==='enemy'){
      ctx.scale(0.8,0.8);
      ctx.fillStyle='#c9342a'; ctx.beginPath(); ctx.ellipse(0,0,13,11,0,0,Math.PI*2); ctx.fill();
    } else {
      drawPullIcon(player.carrying.type);
    }
    ctx.restore();
  }

  if (player.speedTime>0){
    ctx.strokeStyle='rgba(58,208,255,0.6)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(-player.w/2-8,ph/4); ctx.lineTo(-player.w/2,ph/4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-player.w/2-8,ph/4+8); ctx.lineTo(-player.w/2,ph/4+8); ctx.stroke();
  }
  ctx.restore();

  if (player.carrying && player.carrying.type==='enemy'){
    const e = player.carrying.enemyRef;
    if (e){ e.x = player.x+player.w/2-14; e.y = py-24; }
  }
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
      case 'gem': tone(988,0,0.06,'square',0.09); tone(1568,0.05,0.12,'square',0.08); break;
      case 'pull': tone(300,0,0.08,'square',0.09,500); break;
      case 'throw': tone(500,0,0.08,'sawtooth',0.09,250); break;
      case 'defeat': tone(180,0,0.09,'triangle',0.11,90); break;
      case 'explode': tone(90,0,0.2,'sawtooth',0.15,40); tone(60,0.05,0.25,'square',0.12,30); break;
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
  [246,277,311,370,415],
  [233,262,311,349,415],
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
  document.getElementById('gemCount').textContent = `💎 x${player.gems}`;
  document.getElementById('timeLabel').textContent = `⏱ ${Math.max(0,Math.ceil(timeLeft))}`;
  updateHUDStatic();
}

let lastT = performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const dt = Math.min(3, (now-lastT)/16.67);
  lastT = now;
  if (state==='playing'){
    timeLeft -= dt/60;
    if (timeLeft<=0){ timeLeft=0; hurtPlayer(true); }
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
