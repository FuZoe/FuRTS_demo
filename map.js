// ============================================================
//  FuRTS - 地图模块（分层系统）
//  terrain / resource / obstacle / building 四层地图数据
// ============================================================

const CELL = 24;
const MAP_W = 60;
const MAP_H = 40;

// ---- 地形类型常量 ----
const TERRAIN_GRASS = 0;   // 草地 - 可通行
const TERRAIN_SAND  = 1;   // 沙地 - 可通行（减速）
const TERRAIN_WATER = 2;   // 水域 - 不可通行
const TERRAIN_HILL  = 3;   // 高地 - 可通行

// ---- 地形属性 ----
const TERRAIN_PROPS = {
  [TERRAIN_GRASS]: { walkable: true, speedMult: 1.0, color: '#0a1a0a', char: null, charColor: null },
  [TERRAIN_SAND]:  { walkable: true, speedMult: 0.7, color: '#1a1508', char: '沙', charColor: '#3a2a10' },
  [TERRAIN_WATER]: { walkable: false, speedMult: 0, color: '#0a0a2a', char: '水', charColor: '#2244aa' },
  [TERRAIN_HILL]:  { walkable: true, speedMult: 0.9, color: '#151515', char: '丘', charColor: '#444' },
};

// ---- 四层地图数据 ----
// terrain[y][x]  — 基础地形（TERRAIN_* 常量）
// resource[y][x] — 资源层（0=无, 1=矿石）
// obstacle[y][x] — 障碍层（0=无, 1=岩石）
// building[y][x] — 建筑层（0=无, 建筑实体id）

const mapLayers = {
  terrain: [],
  resource: [],
  obstacle: [],
  building: [],
};

function createEmptyLayer(defaultVal) {
  const layer = [];
  for (let y = 0; y < MAP_H; y++) {
    layer[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      layer[y][x] = defaultVal;
    }
  }
  return layer;
}

function initMapLayers() {
  mapLayers.terrain  = createEmptyLayer(TERRAIN_GRASS);
  mapLayers.resource = createEmptyLayer(0);
  mapLayers.obstacle = createEmptyLayer(0);
  mapLayers.building = createEmptyLayer(0);
}

// ---- 战争迷雾 ----
// 0=未探索(Unexplored), 1=已探索(Explored), 2=可见(Visible)
const FOG_UNEXPLORED = 0;
const FOG_EXPLORED = 1;
const FOG_VISIBLE = 2;
const fogMap = [];
for (let y = 0; y < MAP_H; y++) {
  fogMap[y] = [];
  for (let x = 0; x < MAP_W; x++) {
    fogMap[y][x] = FOG_UNEXPLORED;
  }
}

// ---- 放置矿区 ----
function placeMineral(cx, cy, count) {
  for (let i = 0; i < count; i++) {
    const dx = cx + Math.floor(Math.random() * 5) - 2;
    const dy = cy + Math.floor(Math.random() * 4) - 2;
    if (dx >= 0 && dx < MAP_W && dy >= 0 && dy < MAP_H) {
      mapLayers.resource[dy][dx] = 1;
    }
  }
}

// ---- 放置地形区域 ----
function placeTerrainPatch(cx, cy, radius, type) {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) continue;
      if (dx * dx + dy * dy <= radius * radius + Math.random() * radius * 2) {
        mapLayers.terrain[y][x] = type;
      }
    }
  }
}

// ---- 默认地图初始化 ----
function initDefaultMap() {
  initMapLayers();

  // 地形：沙地区域
  placeTerrainPatch(28, 18, 4, TERRAIN_SAND);
  placeTerrainPatch(15, 25, 3, TERRAIN_SAND);
  placeTerrainPatch(45, 12, 3, TERRAIN_SAND);

  // 地形：小水域
  placeTerrainPatch(20, 8, 2, TERRAIN_WATER);
  placeTerrainPatch(38, 30, 2, TERRAIN_WATER);

  // 地形：高地
  placeTerrainPatch(10, 18, 3, TERRAIN_HILL);
  placeTerrainPatch(48, 22, 3, TERRAIN_HILL);

  // 确保基地区域是草地（玩家右下 ~50-58,30-38，敌方左上 ~2-8,2-8）
  for (let y = 30; y < MAP_H; y++) {
    for (let x = 48; x < MAP_W; x++) {
      mapLayers.terrain[y][x] = TERRAIN_GRASS;
    }
  }
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      mapLayers.terrain[y][x] = TERRAIN_GRASS;
    }
  }

  // 矿区（四角+中央）
  placeMineral(5, 5, 12);
  placeMineral(50, 5, 10);
  placeMineral(5, 32, 10);
  placeMineral(50, 32, 10);
  placeMineral(28, 18, 8);

  // 障碍物（中央区域随机岩石）
  for (let i = 0; i < 30; i++) {
    const rx = Math.floor(Math.random() * MAP_W);
    const ry = Math.floor(Math.random() * MAP_H);
    if (rx > 20 && rx < 40 && ry > 10 && ry < 30) {
      // 不在水域上放岩石
      if (mapLayers.terrain[ry][rx] !== TERRAIN_WATER) {
        mapLayers.obstacle[ry][rx] = 1;
      }
    }
  }
}

// 初始化默认地图
initDefaultMap();
