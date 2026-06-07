// ============================================================
//  FuRTS - 地图模块（分层系统）
//  terrain / resource / obstacle / building 四层地图数据
//  支持多张地图，每张地图可定制 MAP_W / MAP_H
// ============================================================

const CELL = 24;
// 注意：MAP_W / MAP_H 由地图初始化函数通过 setMapDimensions(w, h) 设置
let MAP_W = 60;
let MAP_H = 40;

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

function setMapDimensions(w, h) {
  MAP_W = w;
  MAP_H = h;
}

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
// 保持 fogMap 为同一个数组引用（便于其他模块直接持有引用），仅清空并重填
const fogMap = [];
function initFogMap() {
  fogMap.length = 0;
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) row.push(FOG_UNEXPLORED);
    fogMap.push(row);
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

// 固定位置的矩形矿区（用于亡者之夜地图，避免随机）
function placeMineralRect(x0, y0, w, h) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const x = x0 + dx;
      const y = y0 + dy;
      if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H) {
        mapLayers.resource[y][x] = 1;
      }
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

// 矩形地形（用于亡者之夜地图的水墙等固定结构）
function placeTerrainRect(x0, y0, w, h, type) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const x = x0 + dx;
      const y = y0 + dy;
      if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H) {
        mapLayers.terrain[y][x] = type;
      }
    }
  }
}

// ---- 默认地图初始化 ----
function initDefaultMap() {
  setMapDimensions(60, 40);
  initMapLayers();
  initFogMap();

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

// ============================================================
//  亡者之夜地图 (Dead of Night) - 80×60 固定布局
//  参考 SC2「亡者之夜」: 玩家基地居中, 四面水墙+4条咽喉通道,
//  四角丧尸出生点, 沙地减速带, 高地防御点。
// ============================================================
function initDeadOfNightMap() {
  setMapDimensions(80, 60);
  initMapLayers();
  initFogMap();

  // ---- 沙地减速带（基地外围一圈，让敌方在接近基地时减速） ----
  placeTerrainRect(20, 20, 40, 20, TERRAIN_SAND);

  // 玩家基地区域回填草地（保证基地可放置 & 单位不减速）
  placeTerrainRect(34, 24, 12, 12, TERRAIN_GRASS);

  // ---- 四面水墙（围城屏障）+ 4 条咽喉通道 ----
  // 北水墙: y=14..16, x=10..69, 中央留通道 x=37..42
  placeTerrainRect(10, 14, 60, 3, TERRAIN_WATER);
  placeTerrainRect(37, 14, 6, 3, TERRAIN_GRASS); // 北通道
  // 南水墙: y=43..45
  placeTerrainRect(10, 43, 60, 3, TERRAIN_WATER);
  placeTerrainRect(37, 43, 6, 3, TERRAIN_GRASS); // 南通道
  // 西水墙: x=14..16, y=17..42, 留通道 y=27..32
  placeTerrainRect(14, 17, 3, 26, TERRAIN_WATER);
  placeTerrainRect(14, 27, 3, 6, TERRAIN_GRASS); // 西通道
  // 东水墙: x=63..65
  placeTerrainRect(63, 17, 3, 26, TERRAIN_WATER);
  placeTerrainRect(63, 27, 3, 6, TERRAIN_GRASS); // 东通道

  // ---- 通道两侧高地（防御塔的好位置） ----
  // 北通道两侧
  placeTerrainRect(33, 12, 3, 5, TERRAIN_HILL);
  placeTerrainRect(44, 12, 3, 5, TERRAIN_HILL);
  // 南通道两侧
  placeTerrainRect(33, 43, 3, 5, TERRAIN_HILL);
  placeTerrainRect(44, 43, 3, 5, TERRAIN_HILL);
  // 西通道两侧
  placeTerrainRect(12, 23, 5, 3, TERRAIN_HILL);
  placeTerrainRect(12, 34, 5, 3, TERRAIN_HILL);
  // 东通道两侧
  placeTerrainRect(63, 23, 5, 3, TERRAIN_HILL);
  placeTerrainRect(63, 34, 5, 3, TERRAIN_HILL);

  // ---- 确保四角丧尸出生点区域是干净的草地 ----
  placeTerrainRect(3, 3, 8, 8, TERRAIN_GRASS);     // NW
  placeTerrainRect(69, 3, 8, 8, TERRAIN_GRASS);    // NE
  placeTerrainRect(3, 49, 8, 8, TERRAIN_GRASS);    // SW
  placeTerrainRect(69, 49, 8, 8, TERRAIN_GRASS);   // SE

  // ---- 6 个固定矿区 ----
  // 单格矿储量 ≈ 6.67 trips × 5 minerals = ~33 minerals
  // 总储量目标 ≈ 2000+，足够开局 + 中期建队 + 拉持久战
  //
  // 四角矿区（靠近丧尸出生点，采矿有风险，但储量较多）
  // 4 × 12 cells × 33 ≈ 1584 minerals
  placeMineralRect(7, 7, 4, 3);    // NW (12 cells)
  placeMineralRect(69, 7, 4, 3);   // NE
  placeMineralRect(7, 50, 4, 3);   // SW
  placeMineralRect(69, 50, 4, 3);  // SE
  // 中央矿区（中等风险，位于沙地上，靠近西通道）
  // 9 cells × 33 ≈ 297 minerals
  placeMineralRect(27, 28, 3, 3);  // 西侧中央矿
  // 基地旁安全矿（紧邻基地，位于安全草地内，可持续开采到中期）
  // 15 cells × 33 ≈ 495 minerals
  placeMineralRect(41, 30, 5, 3);  // 紧邻玩家基地东侧
}

// ============================================================
//  战争峡谷 (War Canyon) - 60×40 1v1 对称竞技地图
//  玩家左下 vs 敌方右上, 中央水域切割战场, 峡谷控制决定进攻路线。
// ============================================================
function initWarCanyonMap() {
  setMapDimensions(60, 40);
  initMapLayers();
  initFogMap();

  // 中央峡谷：水域包围, 中央留出狭长通道。
  placeTerrainRect(25, 0, 2, 17, TERRAIN_WATER);
  placeTerrainRect(25, 23, 2, 17, TERRAIN_WATER);
  placeTerrainRect(33, 0, 2, 17, TERRAIN_WATER);
  placeTerrainRect(33, 23, 2, 17, TERRAIN_WATER);

  // 峡谷两侧高地, 远程单位可在两翼获得射程优势。
  placeTerrainRect(22, 15, 3, 10, TERRAIN_HILL);
  placeTerrainRect(35, 15, 3, 10, TERRAIN_HILL);

  // 清理双方基地与核心通道, 保证开局和通行性。
  placeTerrainRect(2, 30, 12, 9, TERRAIN_GRASS);
  placeTerrainRect(46, 1, 12, 9, TERRAIN_GRASS);
  placeTerrainRect(27, 17, 6, 6, TERRAIN_GRASS);

  // 中央争夺区减速带。
  placeTerrainPatch(29, 20, 2, TERRAIN_SAND);

  // 玩家方矿区。
  placeMineralRect(8, 35, 4, 3);    // 主矿
  placeMineralRect(11, 27, 4, 2);   // 自然扩张

  // 敌方矿区（对称）。
  placeMineralRect(48, 2, 4, 3);
  placeMineralRect(45, 11, 4, 2);

  // 中立矿区（峡谷内争夺点）。
  placeMineralRect(28, 18, 2, 2);
  placeMineralRect(30, 21, 2, 2);

  // 随机岩石只放在峡谷两肩, 避免堵死 3 格核心通道。
  for (let i = 0; i < 15; i++) {
    const rx = 27 + Math.floor(Math.random() * 6);
    const ry = 17 + Math.floor(Math.random() * 6);
    const inCorePassage = rx >= 29 && rx <= 31 && ry >= 17 && ry <= 22;
    if (!inCorePassage && mapLayers.terrain[ry][rx] === TERRAIN_GRASS && mapLayers.resource[ry][rx] === 0) {
      mapLayers.obstacle[ry][rx] = 1;
    }
  }
}

// ============================================================
//  地图注册表
// ============================================================
const MAP_REGISTRY = [
  {
    id: 'default',
    name: '默认地图',
    desc: '标准对战 - 60×40 · 随机岩石 · 经典左上 vs 右下',
    mapW: 60,
    mapH: 40,
    initFn: initDefaultMap,
  },
  {
    id: 'dead_of_night',
    name: '亡者之夜',
    desc: '四面围城 - 80×60 · 4 条咽喉通道 · 四角丧尸出生点',
    mapW: 80,
    mapH: 60,
    initFn: initDeadOfNightMap,
  },
  {
    id: 'war_canyon',
    name: '战争峡谷',
    desc: '中央峡谷对称地图，控制通道即控制战局',
    mapW: 60,
    mapH: 40,
    initFn: initWarCanyonMap,
  },
];
