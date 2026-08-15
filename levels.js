// ============================================================
// KINGDOM DASH: WORLD TOUR — LEVEL SYSTEM
// 20 levels across 5 classic-style kingdoms (4 levels each,
// the 4th of each world is a castle boss fight).
// ============================================================

const TILE = 32;

const WORLDS = [
  { name: "Green Hills", sky1: "#5c94fc", sky2: "#a8d8ff", ground: "#7a4a2a", groundTop: "#3ea832", accent: "#2e7d32", cloud:true, hills:"#4a9e3f" },
  { name: "Sandy Dunes", sky1: "#ffb84d", sky2: "#ffe0a3", ground: "#c9963c", groundTop: "#e8c268", accent: "#a86a2a", cloud:true, hills:"#d9a24a" },
  { name: "Coral Sea", sky1: "#02182a", sky2: "#0a4a6a", ground: "#0a2a3a", groundTop: "#1a5a6a", accent: "#2adfff", cloud:false, hills:"#062035" },
  { name: "Frosty Peaks", sky1: "#2a3d5c", sky2: "#7ab8e8", ground: "#3a5a7a", groundTop: "#cfefff", accent: "#8ad8ff", cloud:true, hills:"#4a6a8a" },
  { name: "Dragon Castle", sky1: "#1a0505", sky2: "#4a1010", ground: "#3a2020", groundTop: "#6a2a2a", accent: "#ff5a1a", cloud:false, hills:"#2a1010" },
];

const ENEMY_TYPES = ["goomba","koopa","spiky","flyer","hopper","turret","chaser","ghost"];

function makeRNG(seed) {
  let s = seed;
  return function() {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s / 0x7fffffff);
  };
}

function buildLevel(index) {
  const worldIdx = Math.floor(index / 4);
  const stageInWorld = index % 4;
  const theme = WORLDS[worldIdx];
  const rng = makeRNG(index * 7919 + 13);
  const isBoss = stageInWorld === 3;

  const ARENA_WIDTH = 46;
  const width = isBoss ? (190 + Math.floor(rng()*30) + ARENA_WIDTH) : 170 + Math.floor(rng()*40);
  const height = 18;
  const groundY = 14;
  const arenaStartX = isBoss ? width - ARENA_WIDTH : null;

  const tiles = Array.from({length:height}, () => new Array(width).fill(0));

  let x = 0;
  while (x < width) {
    const inArena = isBoss && x >= arenaStartX - 4;
    const segLen = inArena ? (width-x) : 8 + Math.floor(rng()*14);
    for (let i=0;i<segLen && x<width;i++,x++){
      for (let y=groundY;y<height;y++) tiles[y][x] = isBoss?9:1;
    }
    if (!inArena && x < width - 20 && rng() < 0.55) {
      const pitLen = 2 + Math.floor(rng()*3);
      x += pitLen;
    }
  }
  for (let y=groundY;y<height;y++){ tiles[y][0]=1; tiles[y][1]=1; tiles[y][width-1]=1; tiles[y][width-2]=1; tiles[y][width-3]=1; }

  const entities = { enemies:[], coins:[], powerups:[], platforms:[], decor:[] };

  const decorEndX = isBoss ? arenaStartX - 6 : width - 8;
  for (let x2=6; x2<decorEndX; x2+=3+Math.floor(rng()*5)) {
    const roll = rng();
    const groundHere = findGroundY(tiles, x2, height);
    if (roll < 0.22 && groundHere > 4) {
      const py = groundHere - (3 + Math.floor(rng()*4));
      const rowLen = 1 + Math.floor(rng()*4);
      for (let k=0;k<rowLen;k++){
        if (x2+k>=width-2) break;
        const isQ = rng() < 0.35;
        tiles[py][x2+k] = isQ ? (rng()<0.25?4:3) : 2;
      }
    } else if (roll < 0.35 && groundHere > 6) {
      const steps = 2+Math.floor(rng()*3);
      for (let s=0;s<steps;s++){
        for (let yy=0; yy<=s; yy++){
          const py = groundHere-1-yy;
          const px = x2+s;
          if (px<width-2 && py>=2) tiles[py][px]=2;
        }
      }
    } else if (roll < 0.45) {
      const ph = 2+Math.floor(rng()*3);
      for (let yy=0; yy<ph; yy++){
        const py = groundHere-1-yy;
        if (py>=2) tiles[py][x2] = 5;
      }
      if (rng()<0.3) entities.enemies.push({type:"piranha", x:x2*TILE+TILE/2, y:(groundHere-ph)*TILE, homeY:(groundHere-ph)*TILE});
    } else if (roll < 0.6 && groundHere>5) {
      const py = groundHere - (4+Math.floor(rng()*4));
      const rowLen = 3+Math.floor(rng()*4);
      for (let k=0;k<rowLen;k++){
        if (x2+k<width-2) tiles[py][x2+k] = 7;
      }
    }
  }

  let ecount = isBoss ? 24 + Math.floor(rng()*8) : 14 + Math.floor(rng()*10);
  const enemyZoneEnd = isBoss ? arenaStartX - 4 : width - 20;
  for (let i=0;i<ecount;i++){
    const ex = 10 + Math.floor(rng()*Math.max(10,enemyZoneEnd-10));
    const gY = findGroundY(tiles, ex, height);
    if (gY <= 2) continue;
    const type = ENEMY_TYPES[Math.floor(rng()*ENEMY_TYPES.length)];
    if (type==="flyer" || type==="ghost") {
      entities.enemies.push({type, x:ex*TILE, y:(gY-4-Math.floor(rng()*3))*TILE, range:60+rng()*80});
    } else {
      entities.enemies.push({type, x:ex*TILE, y:(gY-1)*TILE});
    }
  }

  let ccount = 30 + Math.floor(rng()*30) + (isBoss?20:0);
  for (let i=0;i<ccount;i++){
    const cx = 6 + Math.floor(rng()*(width-12));
    const gY = findGroundY(tiles, cx, height);
    const cy = gY - (2+Math.floor(rng()*6));
    if (cy>=2 && tiles[cy][cx]===0) entities.coins.push({x:cx*TILE+16, y:cy*TILE+16});
  }

  const powerPool = ["mushroom","fireflower","star","feather","shield"];
  let pcount = (isBoss ? 6 : 4) + Math.floor(rng()*3);
  for (let i=0;i<pcount;i++){
    const px = 15 + Math.floor(rng()*Math.max(20,(isBoss?enemyZoneEnd:width-30)));
    const gY = findGroundY(tiles, px, height);
    const py = gY - (2+Math.floor(rng()*3));
    if (py>=2) entities.powerups.push({x:px*TILE+16, y:py*TILE, type:powerPool[Math.floor(rng()*powerPool.length)]});
  }
  if (isBoss) {
    const preArenaX = arenaStartX - 3;
    const gY1 = findGroundY(tiles, preArenaX, height);
    entities.powerups.push({x:preArenaX*TILE, y:(gY1-3)*TILE, type:'shield'});
    entities.powerups.push({x:(preArenaX-3)*TILE, y:(gY1-3)*TILE, type:'star'});
  }

  let boss = null;
  let arena = null;
  if (isBoss) {
    arena = buildArena(tiles, theme, arenaStartX, width, groundY, height, rng, entities, worldIdx);
    const bossX = (arenaStartX + Math.floor(ARENA_WIDTH*0.55)) * TILE;
    boss = {
      type: "kingboss",
      x: bossX, y:(groundY-4)*TILE,
      hp: 10 + worldIdx*3,
      maxHp: 10 + worldIdx*3,
      phase: 1,
      arenaLeft: arenaStartX*TILE + TILE*2,
      arenaRight: (width-4)*TILE,
    };
  }

  const goal = isBoss
    ? { x:(width-4)*TILE, y:(groundY-8)*TILE }
    : { x:(width-5)*TILE, y:(groundY-8)*TILE };

  return {
    index, theme, width, height, tiles, groundY,
    entities, boss, goal, isBoss, arena, arenaStartX,
    name: `${theme.name} ${stageInWorld+1}-${isBoss?"BOSS":stageInWorld+1}`,
    worldNum: worldIdx+1, stageNum: stageInWorld+1,
    timeLimit: isBoss ? 560 : 300 + Math.floor(rng()*60),
  };
}

function findGroundY(tiles, x, height) {
  for (let y=0;y<height;y++){
    if (tiles[y][x] && tiles[y][x]!==7) return y;
  }
  return height-1;
}

function buildArena(tiles, theme, startX, width, groundY, height, rng, entities, worldIdx) {
  const floorStart = Math.max(0, startX - 5);
  for (let ty=0; ty<groundY; ty++){
    for (let tx=startX; tx<width; tx++){
      tiles[ty][tx] = 0;
    }
  }
  for (let tx=floorStart; tx<width; tx++){
    for (let ty=groundY; ty<height; ty++){
      tiles[ty][tx] = 9;
    }
  }
  const platforms = [];
  for (let i=0;i<3;i++){
    const px = startX + 6 + i*13;
    const py = groundY - (4 + (i%2)*3);
    const len = 4;
    for (let k=0;k<len;k++){
      if (px+k < width-3) tiles[py][px+k] = 7;
    }
    platforms.push({x:px,y:py,len});
  }
  for (let i=0;i<2;i++){
    const px = startX + 2 + i*(width-startX-6);
    for (let py=groundY-6; py<groundY; py++){
      if (px>=0 && px<width) tiles[py][px] = 9;
    }
  }
  if (worldIdx === 4) {
    entities.enemies.push({type:'flyer', x:(startX+10)*TILE, y:(groundY-6)*TILE, range:100});
    entities.enemies.push({type:'flyer', x:(startX+26)*TILE, y:(groundY-5)*TILE, range:120});
  }
  for (let i=0;i<12;i++){
    const cx = startX+4+Math.floor(rng()*(width-startX-8));
    const cy = groundY-3-Math.floor(rng()*5);
    entities.coins.push({x:cx*TILE+16, y:cy*TILE+16});
  }
  return { startX, width, platforms };
}

const ALL_LEVELS_META = Array.from({length:20}, (_,i) => {
  const w = Math.floor(i/4)+1, s = (i%4)+1;
  return { index:i, world:w, stage:s, isBoss: s===4, theme: WORLDS[Math.floor(i/4)].name };
});
