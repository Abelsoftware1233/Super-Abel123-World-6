// ============================================================
// SUPER ABEL 123 WORLD — LEVEL SYSTEM
// Pick-and-throw platformer. 20 levels across 5 worlds
// (4 levels each, 4th = boss). Enemies are mostly immune to
// stomping — Abel must pull items from glowing patches and
// throw them to stun/defeat foes.
// ============================================================

const TILE = 32;

const WORLDS = [
  { name: "Sunny Patch", sky1: "#5cc4fc", sky2: "#bfe8ff", ground: "#6a4a2a", groundTop: "#4ea832", accent: "#2e8d47", cloud:true, hills:"#4ab93f" },
  { name: "Dune Fields", sky1: "#ffc86d", sky2: "#ffe8bd", ground: "#c9963c", groundTop: "#e8c268", accent: "#a86a2a", cloud:true, hills:"#d9a24a" },
  { name: "Misty Marsh", sky1: "#3a4a3a", sky2: "#7a9a7a", ground: "#2a3a2a", groundTop: "#4a6a4a", accent: "#6a9a6a", cloud:true, hills:"#2a4a2a" },
  { name: "Frozen Yard", sky1: "#2a3d5c", sky2: "#8ac8f8", ground: "#3a5a7a", groundTop: "#d8f5ff", accent: "#8ad8ff", cloud:true, hills:"#4a6a8a" },
  { name: "Ember Keep", sky1: "#2a0a05", sky2: "#6a2010", ground: "#3a2020", groundTop: "#8a3a2a", accent: "#ff6a1a", cloud:false, hills:"#2a1010" },
];

// Enemy roster — designed around the throw mechanic:
// - "grounder": normal walker, stunned by any thrown item, defeated by a second hit or a heavy item
// - "shellback": armored, immune to carrots, needs a rock or bomb
// - "floater": airborne, needs to be hit while overhead
// - "digger": pops out of the ground periodically, vulnerable only when up
// - "sentry": stationary, lobs projectiles, must be hit from the side
const ENEMY_TYPES = ["grounder","shellback","floater","digger","sentry"];

function makeRNG(seed) {
  let s = seed;
  return function() {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s / 0x7fffffff);
  };
}

const PULL_TYPES = ["carrot","rock","bomb","goldturnip","icechunk"];

const BOSS_NAMES = ["Grand Cabbage King","Duneback the Armored","Marsh Fang","Frostjaw","Ember Tyrant"];

function buildLevel(index) {
  const worldIdx = Math.floor(index / 4);
  const stageInWorld = index % 4;
  const theme = WORLDS[worldIdx];
  const rng = makeRNG(index * 50331 + 271);
  const isBoss = stageInWorld === 3;

  const ARENA_WIDTH = 46;
  const width = isBoss ? (190 + Math.floor(rng()*30) + ARENA_WIDTH) : 165 + Math.floor(rng()*40);
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
    if (!inArena && x < width - 20 && rng() < 0.5) {
      const pitLen = 2 + Math.floor(rng()*3);
      x += pitLen;
    }
  }
  for (let y=groundY;y<height;y++){ tiles[y][0]=1; tiles[y][1]=1; tiles[y][width-1]=1; tiles[y][width-2]=1; tiles[y][width-3]=1; }

  const entities = { enemies:[], gems:[], pullSpots:[], powerups:[], platforms:[] };

  // decoration: brick clusters and floating platforms (no pipes — those belong to a different game)
  const decorEndX = isBoss ? arenaStartX - 6 : width - 8;
  for (let x2=6; x2<decorEndX; x2+=3+Math.floor(rng()*5)) {
    const roll = rng();
    const groundHere = findGroundY(tiles, x2, height);
    if (roll < 0.25 && groundHere > 4) {
      const py = groundHere - (3 + Math.floor(rng()*4));
      const rowLen = 1 + Math.floor(rng()*4);
      for (let k=0;k<rowLen;k++){
        if (x2+k>=width-2) break;
        tiles[py][x2+k] = 2; // brick — breakable with a thrown rock
      }
    } else if (roll < 0.4 && groundHere > 6) {
      const steps = 2+Math.floor(rng()*3);
      for (let s=0;s<steps;s++){
        for (let yy=0; yy<=s; yy++){
          const py = groundHere-1-yy;
          const px = x2+s;
          if (px<width-2 && py>=2) tiles[py][px]=2;
        }
      }
    } else if (roll < 0.6 && groundHere>5) {
      const py = groundHere - (4+Math.floor(rng()*4));
      const rowLen = 3+Math.floor(rng()*4);
      for (let k=0;k<rowLen;k++){
        if (x2+k<width-2) tiles[py][x2+k] = 7;
      }
    }
  }

  // pull spots: glowing patches of ground you can grab an item from.
  // Guarantee a healthy spread across the level so Abel always has ammo.
  const pullZoneEnd = isBoss ? arenaStartX - 4 : width - 12;
  let pullCount = (isBoss ? 14 : 9) + Math.floor(rng()*4);
  for (let i=0;i<pullCount;i++){
    const px = 8 + Math.floor(rng()*Math.max(10,pullZoneEnd-8));
    const gY = findGroundY(tiles, px, height);
    if (gY >= height-1 || gY<=2) continue;
    if (tiles[gY][px]!==1 && tiles[gY][px]!==9) continue;
    const type = PULL_TYPES[Math.floor(rng()*PULL_TYPES.length)];
    entities.pullSpots.push({x:px*TILE, y:(gY-1)*TILE, type, used:false, respawnT:0});
  }

  // enemies — placed with the throw mechanic in mind
  const enemyZoneEnd = isBoss ? arenaStartX - 4 : width - 18;
  let ecount = isBoss ? 20 + Math.floor(rng()*6) : 11 + Math.floor(rng()*8);
  for (let i=0;i<ecount;i++){
    const ex = 10 + Math.floor(rng()*Math.max(10,enemyZoneEnd-10));
    const gY = findGroundY(tiles, ex, height);
    if (gY <= 2) continue;
    const type = ENEMY_TYPES[Math.floor(rng()*ENEMY_TYPES.length)];
    if (type==="floater") {
      entities.enemies.push({type, x:ex*TILE, y:(gY-4-Math.floor(rng()*3))*TILE, range:60+rng()*80});
    } else if (type==="digger") {
      entities.enemies.push({type, x:ex*TILE, y:(gY-1)*TILE, holeY:(gY-1)*TILE});
    } else {
      entities.enemies.push({type, x:ex*TILE, y:(gY-1)*TILE});
    }
  }

  // gems (currency/score)
  let gcount = 26 + Math.floor(rng()*26) + (isBoss?18:0);
  for (let i=0;i<gcount;i++){
    const cx = 6 + Math.floor(rng()*(width-12));
    const gY = findGroundY(tiles, cx, height);
    const cy = gY - (2+Math.floor(rng()*6));
    if (cy>=2 && tiles[cy][cx]===0) entities.gems.push({x:cx*TILE+16, y:cy*TILE+16});
  }

  // rare standalone powerups (found directly, not pulled)
  let pcount = (isBoss?3:2) + Math.floor(rng()*2);
  for (let i=0;i<pcount;i++){
    const px = 15 + Math.floor(rng()*Math.max(20,(isBoss?enemyZoneEnd:width-30)));
    const gY = findGroundY(tiles, px, height);
    const py = gY - (2+Math.floor(rng()*3));
    if (py>=2) entities.powerups.push({x:px*TILE+16, y:py*TILE, type: rng()<0.5?'heart':'speedberry'});
  }

  let boss = null;
  let arena = null;
  if (isBoss) {
    arena = buildArena(tiles, theme, arenaStartX, width, groundY, height, rng, entities, worldIdx);
    const bossX = (arenaStartX + Math.floor(ARENA_WIDTH*0.55)) * TILE;
    boss = {
      type: "worldboss",
      bossIdx: worldIdx,
      name: BOSS_NAMES[worldIdx],
      x: bossX, y:(groundY-4)*TILE,
      hp: 8 + worldIdx*3,
      maxHp: 8 + worldIdx*3,
      phase: 1,
      arenaLeft: arenaStartX*TILE + TILE*2,
      arenaRight: (width-4)*TILE,
    };
  }

  const goal = { x:(width-4)*TILE, y:(groundY-8)*TILE };

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
  // arena always has extra pull spots so Abel never runs dry mid-fight
  for (let i=0;i<8;i++){
    const px = startX + 5 + Math.floor(rng()*(width-startX-10));
    const gY = findGroundY(tiles, px, height);
    if (gY>2 && gY<height-1 && (tiles[gY][px]===1||tiles[gY][px]===9)){
      const type = PULL_TYPES[Math.floor(rng()*PULL_TYPES.length)];
      entities.pullSpots.push({x:px*TILE, y:(gY-1)*TILE, type, used:false, respawnT:0});
    }
  }
  for (let i=0;i<10;i++){
    const cx = startX+4+Math.floor(rng()*(width-startX-8));
    const cy = groundY-3-Math.floor(rng()*5);
    entities.gems.push({x:cx*TILE+16, y:cy*TILE+16});
  }
  return { startX, width, platforms };
}

const ALL_LEVELS_META = Array.from({length:20}, (_,i) => {
  const w = Math.floor(i/4)+1, s = (i%4)+1;
  return { index:i, world:w, stage:s, isBoss: s===4, theme: WORLDS[Math.floor(i/4)].name };
});
