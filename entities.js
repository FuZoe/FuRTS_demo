// ============================================================
//  FuRTS - 实体模块
//  单位/建筑定义、创建、寻路、碰撞、实体工具函数
//  依赖: map.js (CELL, MAP_W, MAP_H, mapLayers, TERRAIN_PROPS)
// ============================================================

const TEAM_PLAYER = 0;
const TEAM_ENEMY = 1;

let nextId = 1;
const entities = [];

// ---- 单位类型定义 ----
// vision: 视野半径(格数), 用于战争迷雾
const UNIT_DEFS = {
  worker:  { char: '工', hp: 50, speed: 1.5, atk: 5,  range: 1, cost: 50,  popCost: 1, buildTime: 150, color: '#0f0', desc: '农民 - 采矿/建造', radius: 0.4, vision: 5 },
  soldier: { char: '兵', hp: 80, speed: 1.2, atk: 12, range: 1.5, cost: 75,  popCost: 1, buildTime: 200, color: '#ff0', desc: '步兵 - 近战', radius: 0.4, vision: 6 },
  tank:    { char: '坦', hp: 200, speed: 0.8, atk: 30, range: 4, cost: 150, popCost: 2, buildTime: 400, color: '#f80', desc: '坦克 - 重火力', radius: 0.6, vision: 6 },
  ranger:  { char: '弓', hp: 60, speed: 1.0, atk: 15, range: 5, cost: 100, popCost: 1, buildTime: 250, color: '#0ff', desc: '弓手 - 远程', radius: 0.4, vision: 8 },
  // ---- 丧尸兵种（仅敌方在「亡者之夜」地图生产，参考 SC2 Dead of Night）----
  zombie:    { char: '尸', hp: 40,  speed: 0.6, atk: 8,  range: 1, cost: 25,  popCost: 1, buildTime: 80,  color: '#4a0', desc: '丧尸 - 低速群攻', radius: 0.4, vision: 3 },
  berserker: { char: '猎', hp: 60,  speed: 1.8, atk: 15, range: 1, cost: 60,  popCost: 1, buildTime: 120, color: '#a40', desc: '猎杀体 - 高速突袭', radius: 0.4, vision: 4 },
  bloater:   { char: '腐', hp: 150, speed: 0.5, atk: 20, range: 2, cost: 100, popCost: 2, buildTime: 250, color: '#640', desc: '腐尸怪 - 重型攻城', radius: 0.6, vision: 3 },
};

// ---- 建筑类型定义 ----
// vision: 视野半径(格数), 用于战争迷雾
const BUILDING_DEFS = {
  base:     { char: '基', w: 2, h: 2, hp: 1000, color: '#0f0', desc: '主基地 - 生产农民', produces: ['worker'], cost: 0, vision: 8 },
  barracks: { char: '营', w: 2, h: 2, hp: 500,  color: '#ff0', desc: '兵营 - 生产步兵/弓手', produces: ['soldier', 'ranger'], cost: 150, vision: 6 },
  factory:  { char: '厂', w: 2, h: 2, hp: 600,  color: '#f80', desc: '工厂 - 生产坦克', produces: ['tank'], cost: 200, vision: 6 },
  tower:    { char: '塔', w: 1, h: 1, hp: 300,  color: '#f00', desc: '防御塔 - 自动攻击', cost: 100, vision: 8 },
  supply:   { char: '房', w: 1, h: 1, hp: 200,  color: '#0ff', desc: '人口房 +10人口', cost: 50, vision: 4 },
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
    lastGatherTarget: null,
    carrying: 0,
    buildTarget: null,
    gatherTimer: 0,
    path: [],
    pathRetryFrame: 0,
    actionQueue: [],
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
        mapLayers.building[gy + dy][gx + dx] = e.id;
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

// BFS 发现以 (gx,gy) 为中心的连续矿区
function findMineralPatchCells(gx, gy, maxRadius = 4) {
  const result = [];
  const visited = new Set();
  const queue = [{ gx, gy }];

  while (queue.length > 0) {
    const cell = queue.shift();
    const key = cell.gy * MAP_W + cell.gx;
    if (visited.has(key)) continue;
    visited.add(key);

    if (cell.gx < 0 || cell.gx >= MAP_W || cell.gy < 0 || cell.gy >= MAP_H) continue;
    if (mapLayers.resource[cell.gy]?.[cell.gx] !== 1) continue;
    if (gridDist(gx, gy, cell.gx, cell.gy) > maxRadius) continue;

    result.push(cell);
    for (const dir of [
      { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
      { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
    ]) {
      queue.push({ gx: cell.gx + dir.dx, gy: cell.gy + dir.dy });
    }
  }
  return result;
}

// 负载感知分配：将工人均匀分配到矿区各矿格
function distributeWorkersToMinerals(workers, mineralCells) {
  const load = new Map();
  for (const cell of mineralCells) {
    load.set(`${cell.gx},${cell.gy}`, 0);
  }

  // 统计全局正在采这些矿格的工人（排除本次要分配的工人）
  const workerIds = new Set(workers.map(w => w.id));
  for (const e of entities) {
    if (e.kind !== 'unit' || e.type !== 'worker' || e.hp <= 0) continue;
    if (workerIds.has(e.id)) continue;
    if (e.state !== 'gather' || !e.gatherTarget) continue;
    const key = `${e.gatherTarget.gx},${e.gatherTarget.gy}`;
    if (load.has(key)) {
      load.set(key, load.get(key) + 1);
    }
  }

  // 贪心分配：每个工人选择当前负载最低的矿格，负载相同选距离最近的
  for (const worker of workers) {
    let bestCell = null;
    let bestLoad = Infinity;
    let bestDist = Infinity;

    for (const cell of mineralCells) {
      const key = `${cell.gx},${cell.gy}`;
      const curLoad = load.get(key);
      const d = gridDist(worker.gx, worker.gy, cell.gx, cell.gy);

      if (curLoad < bestLoad || (curLoad === bestLoad && d < bestDist)) {
        bestCell = cell;
        bestLoad = curLoad;
        bestDist = d;
      }
    }

    if (bestCell) {
      worker.state = 'gather';
      worker.gatherTarget = { gx: bestCell.gx, gy: bestCell.gy };
      worker.lastGatherTarget = worker.gatherTarget;
      worker.gatherTimer = 0;
      setUnitPath(worker, bestCell.gx, bestCell.gy);

      const key = `${bestCell.gx},${bestCell.gy}`;
      load.set(key, load.get(key) + 1);
    }
  }
}

function findNearestMineral(fromX, fromY) {
  let best = null, bestDist = Infinity;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (mapLayers.resource[y][x] === 1) {
        const d = gridDist(fromX, fromY, x, y);
        if (d < bestDist) { bestDist = d; best = { gx: x, gy: y }; }
      }
    }
  }
  return best;
}

// 在附近矿格中选择负载最低的（距离作为次级排序）
function findLeastLoadedMineral(fromX, fromY) {
  const nearest = findNearestMineral(fromX, fromY);
  if (!nearest) return null;
  const patch = findMineralPatchCells(nearest.gx, nearest.gy);
  if (patch.length === 0) return nearest;

  const load = new Map();
  for (const cell of patch) {
    load.set(`${cell.gx},${cell.gy}`, 0);
  }
  for (const e of entities) {
    if (e.kind !== 'unit' || e.type !== 'worker' || e.hp <= 0) continue;
    if (e.state !== 'gather' || !e.gatherTarget) continue;
    const key = `${e.gatherTarget.gx},${e.gatherTarget.gy}`;
    if (load.has(key)) {
      load.set(key, load.get(key) + 1);
    }
  }

  let bestCell = null, bestLoad = Infinity, bestDist = Infinity;
  for (const cell of patch) {
    const key = `${cell.gx},${cell.gy}`;
    const curLoad = load.get(key);
    const d = gridDist(fromX, fromY, cell.gx, cell.gy);
    if (curLoad < bestLoad || (curLoad === bestLoad && d < bestDist)) {
      bestCell = cell;
      bestLoad = curLoad;
      bestDist = d;
    }
  }
  return bestCell || nearest;
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

// ============================================================
//  A* 寻路系统
// ============================================================

function isWalkable(gx, gy) {
  if (gx < 0 || gx >= MAP_W || gy < 0 || gy >= MAP_H) return false;
  const terrainType = mapLayers.terrain[gy][gx];
  if (!TERRAIN_PROPS[terrainType].walkable) return false;
  if (mapLayers.obstacle[gy][gx] !== 0) return false;
  if (mapLayers.building[gy][gx] !== 0) return false;
  return true;
}

function getTerrainSpeedMult(gx, gy) {
  if (gx < 0 || gx >= MAP_W || gy < 0 || gy >= MAP_H) return 1.0;
  return TERRAIN_PROPS[mapLayers.terrain[gy][gx]].speedMult;
}

// 二叉堆（最小堆）
class BinaryHeap {
  constructor() { this.data = []; }
  push(node) {
    this.data.push(node);
    this._bubbleUp(this.data.length - 1);
  }
  pop() {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }
  get size() { return this.data.length; }
  _bubbleUp(i) {
    const node = this.data[i];
    while (i > 0) {
      const pi = (i - 1) >> 1;
      if (this.data[pi].f <= node.f) break;
      this.data[i] = this.data[pi];
      i = pi;
    }
    this.data[i] = node;
  }
  _sinkDown(i) {
    const len = this.data.length;
    const node = this.data[i];
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < len && this.data[l].f < this.data[smallest].f) smallest = l;
      if (r < len && this.data[r].f < this.data[smallest].f) smallest = r;
      if (smallest === i) break;
      this.data[i] = this.data[smallest];
      this.data[smallest] = node;
      i = smallest;
    }
  }
}

// 8方向偏移及代价
const DIRS = [
  { dx: 0, dy: -1, cost: 1 },
  { dx: 1, dy: -1, cost: 1.414 },
  { dx: 1, dy:  0, cost: 1 },
  { dx: 1, dy:  1, cost: 1.414 },
  { dx: 0, dy:  1, cost: 1 },
  { dx: -1, dy:  1, cost: 1.414 },
  { dx: -1, dy:  0, cost: 1 },
  { dx: -1, dy: -1, cost: 1.414 },
];

const MAX_SEARCH_NODES = 800;

function findPath(sx, sy, ex, ey) {
  if (sx === ex && sy === ey) return [];
  // 如果终点不可走，寻找终点附近最近的可走格子
  if (!isWalkable(ex, ey)) {
    let bestDist = Infinity, bestX = ex, bestY = ey, found = false;
    for (let r = 1; r <= 3; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = ex + dx, ny = ey + dy;
          if (isWalkable(nx, ny)) {
            const d = gridDist(sx, sy, nx, ny);
            if (d < bestDist) { bestDist = d; bestX = nx; bestY = ny; found = true; }
          }
        }
      }
      if (found) break;
    }
    ex = bestX;
    ey = bestY;
    if (!isWalkable(ex, ey)) return null;
  }

  const open = new BinaryHeap();
  const closed = new Set();
  const gMap = {};
  const parentMap = {};

  const key = (x, y) => y * MAP_W + x;
  const h = (x, y) => Math.max(Math.abs(x - ex), Math.abs(y - ey));

  const startKey = key(sx, sy);
  gMap[startKey] = 0;
  open.push({ x: sx, y: sy, f: h(sx, sy) });

  let searched = 0;
  while (open.size > 0 && searched < MAX_SEARCH_NODES) {
    const cur = open.pop();
    const ck = key(cur.x, cur.y);

    if (cur.x === ex && cur.y === ey) {
      // 回溯路径
      const path = [];
      let k = ck;
      while (k !== startKey) {
        const px = k % MAP_W, py = Math.floor(k / MAP_W);
        path.push({ x: px * CELL + CELL / 2, y: py * CELL + CELL / 2 });
        k = parentMap[k];
      }
      path.reverse();
      return path;
    }

    if (closed.has(ck)) continue;
    closed.add(ck);
    searched++;

    const curG = gMap[ck];
    for (const dir of DIRS) {
      const nx = cur.x + dir.dx;
      const ny = cur.y + dir.dy;
      if (!isWalkable(nx, ny)) continue;
      // 对角线移动需要两个相邻格都可走（防止穿墙角）
      if (dir.dx !== 0 && dir.dy !== 0) {
        if (!isWalkable(cur.x + dir.dx, cur.y) || !isWalkable(cur.x, cur.y + dir.dy)) continue;
      }
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const terrainMult = TERRAIN_PROPS[mapLayers.terrain[ny][nx]].speedMult;
      const ng = curG + dir.cost / terrainMult;
      if (gMap[nk] === undefined || ng < gMap[nk]) {
        gMap[nk] = ng;
        parentMap[nk] = ck;
        open.push({ x: nx, y: ny, f: ng + h(nx, ny) });
      }
    }
  }

  return null; // 无法到达
}

// 为单位计算并设置路径
function setUnitPath(entity, targetGx, targetGy) {
  const startGx = Math.floor(entity.x / CELL);
  const startGy = Math.floor(entity.y / CELL);
  const path = findPath(startGx, startGy, targetGx, targetGy);
  entity.path = path || [];
}

// ============================================================
//  移动系统
// ============================================================

// 沿路径移动，返回 true 表示已到达终点
function followPath(entity, speed) {
  if (entity.path.length === 0) return true;

  // 检查前方路径点是否仍可通行（应对新建筑等动态障碍）
  const checkAhead = Math.min(entity.path.length, 3);
  for (let i = 0; i < checkAhead; i++) {
    const p = entity.path[i];
    const pgx = Math.floor(p.x / CELL);
    const pgy = Math.floor(p.y / CELL);
    if (!isWalkable(pgx, pgy)) {
      const lastWp = entity.path[entity.path.length - 1];
      const tgx = Math.floor(lastWp.x / CELL);
      const tgy = Math.floor(lastWp.y / CELL);
      setUnitPath(entity, tgx, tgy);
      if (entity.path.length === 0) return true;
      break;
    }
  }

  const wp = entity.path[0];
  const dx = wp.x - entity.x;
  const dy = wp.y - entity.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < speed * 1.5) {
    entity.x = wp.x;
    entity.y = wp.y;
    entity.path.shift();
    if (entity.path.length === 0) {
      entity.gx = Math.floor(entity.x / CELL);
      entity.gy = Math.floor(entity.y / CELL);
      return true;
    }
    return false;
  }
  const nx = entity.x + (dx / d) * speed;
  const ny = entity.y + (dy / d) * speed;
  entity.x = nx;
  entity.y = ny;
  entity.gx = Math.floor(entity.x / CELL);
  entity.gy = Math.floor(entity.y / CELL);
  return false;
}

// 直线移动（用于近距离追踪已在视野内的目标）
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
    if (!isWalkable(ngx, ngy)) {
      // 遇到障碍或建筑，尝试绕行
      const alt1x = entity.x + (dy / d) * speed;
      const alt1y = entity.y - (dx / d) * speed;
      const alt2x = entity.x - (dy / d) * speed;
      const alt2y = entity.y + (dx / d) * speed;
      const g1x = Math.floor(alt1x / CELL), g1y = Math.floor(alt1y / CELL);
      const g2x = Math.floor(alt2x / CELL), g2y = Math.floor(alt2y / CELL);
      if (isWalkable(g1x, g1y)) {
        nx = alt1x; ny = alt1y;
      } else if (isWalkable(g2x, g2y)) {
        nx = alt2x; ny = alt2y;
      } else {
        return false; // 卡住，不移动
      }
    }
  }
  entity.x = Math.max(0, Math.min(nx, MAP_W * CELL));
  entity.y = Math.max(0, Math.min(ny, MAP_H * CELL));
  entity.gx = Math.floor(entity.x / CELL);
  entity.gy = Math.floor(entity.y / CELL);
  return false;
}

// ============================================================
//  单位碰撞系统
// ============================================================

const SEPARATION_FORCE = 0.8;

function isNearWall(e) {
  const gx = Math.floor(e.x / CELL);
  const gy = Math.floor(e.y / CELL);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (!isWalkable(gx + dx, gy + dy)) return true;
    }
  }
  return false;
}

function applyUnitSeparation() {
  const alive = entities.filter(e => e.kind === 'unit' && e.hp > 0);
  const n = alive.length;
  for (let i = 0; i < n; i++) {
    const a = alive[i];
    const aIsMoving = a.path && a.path.length > 0;
    const aScale = aIsMoving ? (isNearWall(a) ? 0.15 : 0.5) : 1;
    const ra = UNIT_DEFS[a.type].radius * CELL * aScale;
    for (let j = i + 1; j < n; j++) {
      const b = alive[j];
      const bIsMoving = b.path && b.path.length > 0;
      const bScale = bIsMoving ? (isNearWall(b) ? 0.15 : 0.5) : 1;
      const rb = UNIT_DEFS[b.type].radius * CELL * bScale;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const minDist = ra + rb;
      if (d < minDist && d > 0.01) {
        const overlap = (minDist - d) * 0.5 * SEPARATION_FORCE;
        const nx = dx / d, ny = dy / d;
        // 静止单位被推的少
        const aMoving = a.state !== 'idle' && a.state !== 'gather' ? 1.0 : 0.3;
        const bMoving = b.state !== 'idle' && b.state !== 'gather' ? 1.0 : 0.3;
        const total = aMoving + bMoving;
        let pushAx = nx * overlap * (bMoving / total);
        let pushAy = ny * overlap * (bMoving / total);
        let pushBx = nx * overlap * (aMoving / total);
        let pushBy = ny * overlap * (aMoving / total);
        // 如果推动后会进入障碍物，则不推（避免狭窄通道卡死）
        const newAgx = Math.floor((a.x - pushAx) / CELL);
        const newAgy = Math.floor((a.y - pushAy) / CELL);
        if (!isWalkable(newAgx, newAgy)) { pushAx = 0; pushAy = 0; }
        const newBgx = Math.floor((b.x + pushBx) / CELL);
        const newBgy = Math.floor((b.y + pushBy) / CELL);
        if (!isWalkable(newBgx, newBgy)) { pushBx = 0; pushBy = 0; }
        a.x -= pushAx;
        a.y -= pushAy;
        b.x += pushBx;
        b.y += pushBy;
      }
    }
  }
  // 防止单位被推进障碍物
  for (const e of alive) {
    const gx = Math.floor(e.x / CELL);
    const gy = Math.floor(e.y / CELL);
    if (!isWalkable(gx, gy)) {
      // 推回到最近的可走格子中心
      let bestDist = Infinity, bestX = e.x, bestY = e.y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = gx + dx, ny = gy + dy;
          if (isWalkable(nx, ny)) {
            const cx = nx * CELL + CELL / 2, cy = ny * CELL + CELL / 2;
            const d = Math.sqrt((e.x - cx) ** 2 + (e.y - cy) ** 2);
            if (d < bestDist) { bestDist = d; bestX = cx; bestY = cy; }
          }
        }
      }
      e.x = bestX;
      e.y = bestY;
    }
    e.x = Math.max(CELL / 2, Math.min(e.x, MAP_W * CELL - CELL / 2));
    e.y = Math.max(CELL / 2, Math.min(e.y, MAP_H * CELL - CELL / 2));
    e.gx = Math.floor(e.x / CELL);
    e.gy = Math.floor(e.y / CELL);
  }
}

// ---- 建筑放置检测 ----
function canPlaceBuilding(type, gx, gy) {
  const def = BUILDING_DEFS[type];
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) {
      const tx = gx + dx;
      const ty = gy + dy;
      if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return false;
      if (mapLayers.terrain[ty][tx] === TERRAIN_WATER) return false;
      if (mapLayers.resource[ty][tx] !== 0) return false;
      if (mapLayers.obstacle[ty][tx] !== 0) return false;
      if (mapLayers.building[ty][tx] !== 0) return false;
    }
  }
  return true;
}
