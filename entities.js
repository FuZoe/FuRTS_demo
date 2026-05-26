// ============================================================
//  FuRTS - 实体模块
//  单位/建筑定义、创建、实体工具函数
//  依赖: map.js (CELL, MAP_W, MAP_H, mapData)
// ============================================================

const TEAM_PLAYER = 0;
const TEAM_ENEMY = 1;

let nextId = 1;
const entities = [];

// ---- 单位类型定义 ----
const UNIT_DEFS = {
  worker:  { char: '工', hp: 50, speed: 1.5, atk: 5,  range: 1, cost: 50,  popCost: 1, buildTime: 150, color: '#0f0', desc: '农民 - 采矿/建造' },
  soldier: { char: '兵', hp: 80, speed: 1.2, atk: 12, range: 1.5, cost: 75,  popCost: 1, buildTime: 200, color: '#ff0', desc: '步兵 - 近战' },
  tank:    { char: '坦', hp: 200, speed: 0.8, atk: 30, range: 4, cost: 150, popCost: 2, buildTime: 400, color: '#f80', desc: '坦克 - 重火力' },
  ranger:  { char: '弓', hp: 60, speed: 1.0, atk: 15, range: 5, cost: 100, popCost: 1, buildTime: 250, color: '#0ff', desc: '弓手 - 远程' },
};

// ---- 建筑类型定义 ----
const BUILDING_DEFS = {
  base:     { char: '基', w: 2, h: 2, hp: 1000, color: '#0f0', desc: '主基地 - 生产农民', produces: ['worker'], cost: 0 },
  barracks: { char: '营', w: 2, h: 2, hp: 500,  color: '#ff0', desc: '兵营 - 生产步兵/弓手', produces: ['soldier', 'ranger'], cost: 150 },
  factory:  { char: '厂', w: 2, h: 2, hp: 600,  color: '#f80', desc: '工厂 - 生产坦克', produces: ['tank'], cost: 200 },
  tower:    { char: '塔', w: 1, h: 1, hp: 300,  color: '#f00', desc: '防御塔 - 自动攻击', cost: 100 },
  supply:   { char: '房', w: 1, h: 1, hp: 200,  color: '#0ff', desc: '人口房 +10人口', cost: 50 },
};

// ---- 创建单位 ----
function createUnit(type, gx, gy, team) {
  const def = UNIT_DEFS[type];
  const e = {
    id: nextId++,
    kind: 'unit',
    type,
    team,
    gx, gy,
    x: gx * CELL + CELL / 2,
    y: gy * CELL + CELL / 2,
    hp: def.hp,
    maxHp: def.hp,
    state: 'idle',
    target: null,
    attackTarget: null,
    gatherTarget: null,
    carrying: 0,
    buildTarget: null,
    gatherTimer: 0,
  };
  entities.push(e);
  return e;
}

// ---- 创建建筑 ----
function createBuilding(type, gx, gy, team) {
  const def = BUILDING_DEFS[type];
  const e = {
    id: nextId++,
    kind: 'building',
    type,
    team,
    gx, gy,
    x: gx * CELL + (def.w * CELL) / 2,
    y: gy * CELL + (def.h * CELL) / 2,
    hp: def.hp,
    maxHp: def.hp,
    buildProgress: type === 'base' ? def.hp : 0,
    queue: [],
    queueTimer: 0,
    rallyPoint: null,
  };
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) {
      if (gy + dy < MAP_H && gx + dx < MAP_W) {
        mapData[gy + dy][gx + dx] = 3;
      }
    }
  }
  entities.push(e);
  return e;
}

// ---- 工具函数 ----

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function gridDist(ax, ay, bx, by) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

function entityAt(gx, gy) {
  return entities.find(e => {
    if (e.hp <= 0) return false;
    if (e.kind === 'building') {
      const def = BUILDING_DEFS[e.type];
      return gx >= e.gx && gx < e.gx + def.w && gy >= e.gy && gy < e.gy + def.h;
    }
    return Math.floor(e.x / CELL) === gx && Math.floor(e.y / CELL) === gy;
  });
}

function findNearestMineral(fromX, fromY) {
  let best = null, bestDist = Infinity;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (mapData[y][x] === 1) {
        const d = gridDist(fromX, fromY, x, y);
        if (d < bestDist) { bestDist = d; best = { gx: x, gy: y }; }
      }
    }
  }
  return best;
}

function findNearestBase(fromX, fromY, team) {
  let best = null, bestDist = Infinity;
  for (const e of entities) {
    if (e.kind === 'building' && e.type === 'base' && e.team === team && e.hp > 0) {
      const d = dist({ x: fromX * CELL, y: fromY * CELL }, e);
      if (d < bestDist) { bestDist = d; best = e; }
    }
  }
  return best;
}

function findNearestEnemy(entity, range) {
  let best = null, bestDist = Infinity;
  const rangePx = range * CELL;
  for (const e of entities) {
    if (e.hp <= 0 || e.team === entity.team) continue;
    const d = dist(entity, e);
    if (d < rangePx && d < bestDist) { bestDist = d; best = e; }
  }
  return best;
}

function getPlayerUnits() {
  return entities.filter(e => e.team === TEAM_PLAYER && e.hp > 0 && e.kind === 'unit');
}

function getPlayerBuildings() {
  return entities.filter(e => e.team === TEAM_PLAYER && e.hp > 0 && e.kind === 'building');
}

// ---- 移动与避障 ----
function moveToward(entity, tx, ty, speed) {
  const dx = tx - entity.x;
  const dy = ty - entity.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < speed) {
    entity.x = tx;
    entity.y = ty;
    return true;
  }
  let nx = entity.x + (dx / d) * speed;
  let ny = entity.y + (dy / d) * speed;
  const ngx = Math.floor(nx / CELL);
  const ngy = Math.floor(ny / CELL);
  if (ngx >= 0 && ngx < MAP_W && ngy >= 0 && ngy < MAP_H) {
    if (mapData[ngy][ngx] === 2) {
      nx = entity.x + (dy / d) * speed;
      ny = entity.y - (dx / d) * speed;
    }
  }
  entity.x = Math.max(0, Math.min(nx, MAP_W * CELL));
  entity.y = Math.max(0, Math.min(ny, MAP_H * CELL));
  entity.gx = Math.floor(entity.x / CELL);
  entity.gy = Math.floor(entity.y / CELL);
  return false;
}

// ---- 建筑放置检测 ----
function canPlaceBuilding(type, gx, gy) {
  const def = BUILDING_DEFS[type];
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) {
      const tx = gx + dx;
      const ty = gy + dy;
      if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return false;
      if (mapData[ty][tx] !== 0) return false;
    }
  }
  return true;
}
