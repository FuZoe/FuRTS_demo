// ============================================================
//  FuRTS - 地图模块
//  地图常量、地形数据、矿区/障碍物生成
// ============================================================

const CELL = 24;
const MAP_W = 60;
const MAP_H = 40;

// 地图数据: 0=空地, 1=矿石, 2=障碍(岩石), 3=建筑占用
const mapData = [];
for (let y = 0; y < MAP_H; y++) {
  mapData[y] = [];
  for (let x = 0; x < MAP_W; x++) {
    mapData[y][x] = 0;
  }
}

// 放置矿区
function placeMineral(cx, cy, count) {
  for (let i = 0; i < count; i++) {
    const dx = cx + Math.floor(Math.random() * 5) - 2;
    const dy = cy + Math.floor(Math.random() * 4) - 2;
    if (dx >= 0 && dx < MAP_W && dy >= 0 && dy < MAP_H) {
      mapData[dy][dx] = 1;
    }
  }
}

placeMineral(5, 5, 12);
placeMineral(50, 5, 10);
placeMineral(5, 32, 10);
placeMineral(50, 32, 10);
placeMineral(28, 18, 8);

// 放置障碍
for (let i = 0; i < 30; i++) {
  const rx = Math.floor(Math.random() * MAP_W);
  const ry = Math.floor(Math.random() * MAP_H);
  if (rx > 20 && rx < 40 && ry > 10 && ry < 30) {
    mapData[ry][rx] = 2;
  }
}
