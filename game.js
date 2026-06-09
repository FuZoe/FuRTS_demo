// ============================================================
//  FuRTS - 系统界面 / 渲染 / 输入 / 游戏循环
//  依赖: map.js, entities.js
// ============================================================

// ---- 界面常量 ----
const SIDEBAR_W = 220;
const HUD_H = 36;
const LOG_H = 80;
const GATHER_AMOUNT = 5;
const GATHER_TIME = 90;
const BUILD_RANGE = 3;
const EDGE_SCROLL_MARGIN = 20;
const EDGE_SCROLL_SPEED = 6;

// ---- Canvas初始化 ----
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const mmCanvas = document.getElementById('minimap');
const mmCtx = mmCanvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth - SIDEBAR_W;
  canvas.height = window.innerHeight - HUD_H;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ---- 相机 ----
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 1.1;
const camera = { x: 0, y: 0, zoom: 1.0 };

function getViewportWorldWidth() {
  return canvas.width / camera.zoom;
}

function getViewportWorldHeight(includeLog = true) {
  const screenHeight = includeLog ? canvas.height : canvas.height - LOG_H;
  return screenHeight / camera.zoom;
}

function screenToWorld(sx, sy) {
  return {
    x: sx / camera.zoom + camera.x,
    y: sy / camera.zoom + camera.y,
  };
}

function isWorldPointOnScreen(wx, wy, padding = CELL) {
  return wx >= camera.x - padding &&
    wx <= camera.x + getViewportWorldWidth() + padding &&
    wy >= camera.y - padding &&
    wy <= camera.y + getViewportWorldHeight() + padding;
}
function clampCamera() {
  const maxX = MAP_W * CELL - getViewportWorldWidth();
  const maxY = MAP_H * CELL - getViewportWorldHeight(false);
  camera.x = Math.max(0, Math.min(camera.x, maxX));
  camera.y = Math.max(0, Math.min(camera.y, maxY));
}
window.addEventListener('resize', clampCamera);

// ---- 科技升级系统 ----
const UPGRADES = {
  attackUp1: { name: '攻击升级 Lv1', cost: 100, time: 300, effect: { atk: 2 }, requires: [] },
  attackUp2: { name: '攻击升级 Lv2', cost: 150, time: 400, effect: { atk: 3 }, requires: ['attackUp1'] },
  armorUp1: { name: '护甲升级 Lv1', cost: 100, time: 300, effect: { armor: 1 }, requires: [] },
  speedUp1: { name: '速度升级 Lv1', cost: 120, time: 250, effect: { speedMult: 0.15 }, requires: [] },
};

const UPGRADE_KEYS = Object.keys(UPGRADES);

function createUpgradeState() {
  const state = {};
  for (const key of UPGRADE_KEYS) state[key] = { researched: false };
  return state;
}

function getEffectiveUnitStats(unitOrType, team = TEAM_PLAYER) {
  const type = typeof unitOrType === 'string' ? unitOrType : unitOrType.type;
  const unitTeam = typeof unitOrType === 'string' ? team : unitOrType.team;
  const def = UNIT_DEFS[type];
  const stats = {
    atk: def.atk,
    speed: def.speed,
    armor: 0,
    range: def.range,
  };

  if (unitTeam !== TEAM_PLAYER) return stats;

  let speedMult = 0;
  for (const [key, upgrade] of Object.entries(UPGRADES)) {
    if (!game.upgrades[key]?.researched) continue;
    if (upgrade.effect.atk) stats.atk += upgrade.effect.atk;
    if (upgrade.effect.armor) stats.armor += upgrade.effect.armor;
    if (upgrade.effect.speedMult) speedMult += upgrade.effect.speedMult;
  }
  stats.speed *= 1 + speedMult;
  return stats;
}

function getEffectiveArmor(entity) {
  if (!entity || entity.kind !== 'unit') return 0;
  return getEffectiveUnitStats(entity).armor;
}

function getUpgradeStatus(key, building = null) {
  const upgrade = UPGRADES[key];
  if (!upgrade) return { available: false, reason: '未知科技' };
  if (game.upgrades[key]?.researched) return { available: false, reason: '已完成' };
  if (building?.researchQueue?.some(item => item === key)) return { available: false, reason: '研究中' };
  for (const req of upgrade.requires) {
    if (!game.upgrades[req]?.researched) return { available: false, reason: `需要 ${UPGRADES[req].name}` };
  }
  if (game.minerals < upgrade.cost) return { available: false, reason: '矿石不足' };
  return { available: true, reason: '' };
}

// ---- 鼠标边缘滚动 ----
const mouseScreen = {
  x: window.innerWidth / 2,
  y: window.innerHeight / 2,
  active: false,
};

document.addEventListener('mousemove', (e) => {
  mouseScreen.x = e.clientX;
  mouseScreen.y = e.clientY;
  mouseScreen.active = true;
});

document.addEventListener('mouseleave', () => {
  mouseScreen.active = false;
});

window.addEventListener('blur', () => {
  mouseScreen.active = false;
});

function applyEdgeScroll() {
  if (!mouseScreen.active) return;

  const canvasRect = canvas.getBoundingClientRect();
  const visibleLeft = canvasRect.left;
  const visibleRight = canvasRect.right;
  const visibleTop = HUD_H;
  const visibleBottom = window.innerHeight - LOG_H;
  const mouseInPlayableArea =
    mouseScreen.x >= visibleLeft &&
    mouseScreen.x <= visibleRight &&
    mouseScreen.y >= visibleTop &&
    mouseScreen.y <= visibleBottom;
  if (!mouseInPlayableArea) return;

  if (mouseScreen.x < visibleLeft + EDGE_SCROLL_MARGIN) camera.x -= EDGE_SCROLL_SPEED;
  if (mouseScreen.x > visibleRight - EDGE_SCROLL_MARGIN) camera.x += EDGE_SCROLL_SPEED;
  if (mouseScreen.y < visibleTop + EDGE_SCROLL_MARGIN) camera.y -= EDGE_SCROLL_SPEED;
  if (mouseScreen.y > visibleBottom - EDGE_SCROLL_MARGIN) camera.y += EDGE_SCROLL_SPEED;
}

function clampGrid(gx, gy) {
  return {
    gx: Math.max(0, Math.min(MAP_W - 1, gx)),
    gy: Math.max(0, Math.min(MAP_H - 1, gy)),
  };
}

// ---- 游戏状态 ----
const game = {
  minerals: 200,
  pop: 0,
  maxPop: 10,
  upgrades: createUpgradeState(),
  frame: 0,
  selected: [],
  controlGroups: {},
  dragStart: null,
  dragEnd: null,
  buildMode: null,
  buildPreview: null,
  attackMoveMode: false,
  attackMoveQueued: false,
  commandMode: null,
  paused: false,
  speed: 1,
  speedAccumulator: 0,
  gameOver: false,
  stats: {
    mineralsGathered: 0,
    unitsProduced: 0,
    unitsLost: 0,
    unitsKilled: 0,
    buildingsBuilt: 0,
    buildingsDestroyed: 0,
  },
  scrollSpeed: 8,
  keysDown: {},
};

const FOG_UPDATE_INTERVAL = 3;

// ---- 初始单位 / 基地放置（按地图配置） ----
// 这部分逻辑放进 setupGameForMap()，开局时由地图选择界面触发
function setupGameForMap(mapDef) {
  game.currentMapId = mapDef.id;

  let playerBase;
  if (mapDef.id === 'war_canyon') {
    // 战争峡谷：玩家左下，敌方右上，双方靠峡谷和侧翼路线争夺中立矿。
    playerBase = createBuilding('base', 4, 33, TEAM_PLAYER);
    createUnit('worker', 7, 34, TEAM_PLAYER);
    createUnit('worker', 7, 36, TEAM_PLAYER);
    createUnit('worker', 10, 34, TEAM_PLAYER);
    createBuilding('base', 54, 3, TEAM_ENEMY);
    createUnit('worker', 52, 4, TEAM_ENEMY);
    createUnit('worker', 51, 6, TEAM_ENEMY);
    createUnit('soldier', 49, 5, TEAM_ENEMY);
    addLog('⚔️ 「战争峡谷」开始！控制中央峡谷，争夺两侧矿区。');
  } else if (mapDef.id === 'dead_of_night') {
    // 玩家基地居中 (80×60 地图)，基地占 2×2 格子，中心放在 (38, 28)
    playerBase = createBuilding('base', 38, 28, TEAM_PLAYER);
    createUnit('worker', 36, 32, TEAM_PLAYER);
    createUnit('worker', 38, 32, TEAM_PLAYER);
    createUnit('worker', 40, 32, TEAM_PLAYER);
    // 4 个丧尸出生点（敌方基地），地图四角
    createBuilding('base', 5, 5, TEAM_ENEMY);    // NW
    createBuilding('base', 73, 5, TEAM_ENEMY);   // NE
    createBuilding('base', 5, 53, TEAM_ENEMY);   // SW
    createBuilding('base', 73, 53, TEAM_ENEMY);  // SE
    addLog('🧟 「亡者之夜」开始！四面围城，注意守住基地的四条通道。');
  } else {
    // 默认地图：玩家右下，敌方左上
    playerBase = createBuilding('base', MAP_W - 6, MAP_H - 6, TEAM_PLAYER);
    createUnit('worker', MAP_W - 8, MAP_H - 5, TEAM_PLAYER);
    createUnit('worker', MAP_W - 8, MAP_H - 7, TEAM_PLAYER);
    createUnit('worker', MAP_W - 4, MAP_H - 7, TEAM_PLAYER);
    createBuilding('base', 3, 3, TEAM_ENEMY);
    createUnit('worker', 6, 4, TEAM_ENEMY);
    createUnit('worker', 6, 6, TEAM_ENEMY);
    createUnit('soldier', 8, 5, TEAM_ENEMY);
    addLog('⚔️ FuRTS 启动！操作指南见右侧边栏。');
  }

  // 移动相机到玩家基地
  resizeCanvas();
  camera.x = playerBase.x - getViewportWorldWidth() / 2;
  camera.y = playerBase.y - getViewportWorldHeight(false) / 2;
  clampCamera();

  // 初始化时立即计算一次视野, 避免开局第一帧前画面全黑
  updateFog();
  updateSidebar();
}

// ---- 日志系统 ----
const logEl = document.getElementById('log');
const logMessages = [];
function addLog(msg) {
  const time = formatTime(game.frame);
  logMessages.push(`[${time}] ${msg}`);
  if (logMessages.length > 50) logMessages.shift();
  logEl.innerHTML = logMessages.map(m => `<div>${m}</div>`).join('');
  logEl.scrollTop = logEl.scrollHeight;
}
function formatTime(frame) {
  const s = Math.floor(frame / 60);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
}

function recordPlayerKill(attacker, target) {
  if (!attacker || !target || attacker.team !== TEAM_PLAYER || target.team !== TEAM_ENEMY || target._statsKillCounted) return;
  target._statsKillCounted = true;
  if (target.kind === 'building') game.stats.buildingsDestroyed++;
  else if (target.kind === 'unit') game.stats.unitsKilled++;
}

// ---- 人口计算 ----
function countPop() {
  let pop = 0;
  for (const e of entities) {
    if (e.team === TEAM_PLAYER && e.hp > 0 && e.kind === 'unit') {
      pop += UNIT_DEFS[e.type].popCost;
    }
  }
  let maxPop = 10;
  for (const e of entities) {
    if (e.team === TEAM_PLAYER && e.hp > 0 && e.kind === 'building' && e.type === 'supply' && e.buildProgress >= e.maxHp) {
      maxPop += 10;
    }
  }
  game.pop = pop;
  game.maxPop = maxPop;
}

function getUnitSpawnPoint(building) {
  const def = BUILDING_DEFS[building.type];
  const preferred = {
    gx: building.gx + (building.team === TEAM_PLAYER ? -2 : def.w + 1),
    gy: building.gy + 1,
  };
  if (isWalkable(preferred.gx, preferred.gy) && mapLayers.resource[preferred.gy][preferred.gx] === 0) {
    return preferred;
  }

  const minX = building.gx - 1;
  const maxX = building.gx + def.w;
  const minY = building.gy - 1;
  const maxY = building.gy + def.h;
  let best = null;
  let bestDist = Infinity;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (x >= building.gx && x < building.gx + def.w && y >= building.gy && y < building.gy + def.h) continue;
      if (!isWalkable(x, y) || mapLayers.resource[y][x] !== 0) continue;
      const d = Math.abs(x - preferred.gx) + Math.abs(y - preferred.gy);
      if (d < bestDist) {
        bestDist = d;
        best = { gx: x, gy: y };
      }
    }
  }
  return best || { gx: building.gx, gy: building.gy };
}

// ---- 更新逻辑 ----
function update() {
  if (game.paused || game.gameOver) return;
  game.frame++;

  // 键盘滚动
  if (game.keysDown['ArrowLeft'] || game.keysDown['a']) camera.x -= game.scrollSpeed;
  if (game.keysDown['ArrowRight'] || game.keysDown['d']) camera.x += game.scrollSpeed;
  if (game.keysDown['ArrowUp'] || game.keysDown['w']) camera.y -= game.scrollSpeed;
  if (game.keysDown['ArrowDown'] || game.keysDown['s']) camera.y += game.scrollSpeed;
  applyEdgeScroll();
  clampCamera();

  for (const e of entities) {
    if (e.hp <= 0) continue;

    // -- 建筑逻辑 --
    if (e.kind === 'building') {
      if (e.buildProgress < e.maxHp) continue;
      // 防御塔自动攻击
      if (e.type === 'tower') {
        const enemy = findNearestEnemy(e, 6);
        if (enemy && game.frame % 30 === 0) {
          enemy.hp -= 20;
          enemy.lastHitFrame = game.frame;
          if (e.team === TEAM_PLAYER || enemy.team === TEAM_PLAYER) AudioManager.attack();
          if (enemy.hp <= 0) {
            recordPlayerKill(e, enemy);
            addLog(`防御塔消灭了 ${UNIT_DEFS[enemy.type]?.char || '敌人'}`);
            checkGameOver();
          }
        }
      }
      // 生产队列
      if (e.researchQueue && e.researchQueue.length > 0) {
        e.researchTimer++;
        const upgradeKey = e.researchQueue[0];
        const upgrade = UPGRADES[upgradeKey];
        if (e.researchTimer >= upgrade.time) {
          game.upgrades[upgradeKey].researched = true;
          e.researchQueue.shift();
          e.researchTimer = 0;
          if (e.team === TEAM_PLAYER) addLog(`研究完成: ${upgrade.name}`);
          updateSidebar();
        } else if (e.team === TEAM_PLAYER && game.selected.includes(e.id) && game.frame % 15 === 0) {
          updateSidebar();
        }
      }
      if (e.queue.length > 0) {
        e.queueTimer++;
        const producing = e.queue[0];
        const def = UNIT_DEFS[producing];
        if (e.queueTimer >= def.buildTime) {
          const spawn = getUnitSpawnPoint(e);
          const newUnit = createUnit(producing, spawn.gx, spawn.gy, e.team);
          applyRallyPoint(e, newUnit);
          e.queue.shift();
          e.queueTimer = 0;
          if (e.team === TEAM_PLAYER) {
            game.stats.unitsProduced++;
            addLog(`生产完成: ${def.desc}`);
            AudioManager.unitReady();
          }
        }
      }
      continue;
    }

    // -- 单位逻辑 --
    const def = UNIT_DEFS[e.type];
    const stats = getEffectiveUnitStats(e);
    const speed = stats.speed * getTerrainSpeedMult(e.gx, e.gy);

    // 自动反击
    if (e.state === 'idle' || e.state === 'move') {
      const nearby = findNearestEnemy(e, stats.range + 2);
      if (nearby && e.state === 'idle') {
        e.attackTarget = nearby.id;
        e.state = 'attack';
      }
    }

    switch (e.state) {
      case 'move': {
        if (!e.target) { transitionToIdle(e); break; }
        if (e.path.length > 0) {
          const arrived = followPath(e, speed);
          if (arrived) {
            e.target = null;
            transitionToIdle(e);
          }
        } else {
          const arrived = moveToward(e, e.target.x, e.target.y, speed);
          if (arrived) {
            e.target = null;
            transitionToIdle(e);
          }
        }
        break;
      }
      case 'attackMove': {
        const nearby = findNearestEnemy(e, stats.range + 2);
        if (nearby) {
          e.attackTarget = nearby.id;
          e._attackMoveTarget = e.target;
          e.state = 'attack';
          e.path = [];
          e.pathRetryFrame = 0;
          break;
        }
        if (!e.target) { transitionToIdle(e); break; }
        if (e.path.length > 0) {
          const arrived = followPath(e, speed);
          if (arrived) {
            e.target = null;
            transitionToIdle(e);
          }
        } else {
          const arrived = moveToward(e, e.target.x, e.target.y, speed);
          if (arrived) {
            e.target = null;
            transitionToIdle(e);
          }
        }
        break;
      }
      case 'patrol': {
        const nearby = findNearestEnemy(e, stats.range + 2);
        if (nearby) {
          e.attackTarget = nearby.id;
          e._patrolState = {
            pointA: e.patrolPointA,
            pointB: e.patrolPointB,
            toB: e.patrolToB,
          };
          e.state = 'attack';
          e.path = [];
          e.pathRetryFrame = 0;
          break;
        }

        const dest = e.patrolToB ? e.patrolPointB : e.patrolPointA;
        if (!dest) { transitionToIdle(e); break; }

        if (e.path.length > 0) {
          const arrived = followPath(e, speed);
          if (arrived) {
            if (e.actionQueue.length > 0) {
              transitionToIdle(e);
              break;
            }
            e.patrolToB = !e.patrolToB;
            const next = e.patrolToB ? e.patrolPointB : e.patrolPointA;
            if (next) setUnitPath(e, Math.floor(next.x / CELL), Math.floor(next.y / CELL));
          }
        } else {
          const tgx = Math.floor(dest.x / CELL);
          const tgy = Math.floor(dest.y / CELL);
          setUnitPath(e, tgx, tgy);
          if (e.path.length === 0 && moveToward(e, dest.x, dest.y, speed)) {
            if (e.actionQueue.length > 0) {
              transitionToIdle(e);
              break;
            }
            e.patrolToB = !e.patrolToB;
          }
        }
        break;
      }
      case 'attack': {
        const target = entities.find(t => t.id === e.attackTarget);
        if (!target || target.hp <= 0) {
          e.attackTarget = null;
          e.path = [];
          if (e._attackMoveTarget) {
            e.target = e._attackMoveTarget;
            e._attackMoveTarget = null;
            e.state = 'attackMove';
            setUnitPath(e, Math.floor(e.target.x / CELL), Math.floor(e.target.y / CELL));
          } else {
            resumePatrolOrIdle(e);
          }
          break;
        }
        const d = dist(e, target);
        if (d > stats.range * CELL) {
          // 远距离用A*寻路，每60帧重算一次
          if (e.path.length > 0) {
            followPath(e, speed);
          } else if (game.frame - e.pathRetryFrame > 60) {
            const tgx = Math.floor(target.x / CELL);
            const tgy = Math.floor(target.y / CELL);
            setUnitPath(e, tgx, tgy);
            e.pathRetryFrame = game.frame;
            if (e.path.length === 0) moveToward(e, target.x, target.y, speed);
          } else {
            moveToward(e, target.x, target.y, speed);
          }
        } else {
          e.path = [];
          if (game.frame % 20 === 0) {
            const damage = Math.max(1, stats.atk - getEffectiveArmor(target));
            target.hp -= damage;
            target.lastHitFrame = game.frame;
            if (e.team === TEAM_PLAYER || target.team === TEAM_PLAYER) AudioManager.attack();
            if (target.hp <= 0) {
              recordPlayerKill(e, target);
              addLog(`${def.char} 消灭了 ${target.kind === 'building' ? BUILDING_DEFS[target.type].char : UNIT_DEFS[target.type].char}`);
              e.attackTarget = null;
              if (e._attackMoveTarget) {
                e.target = e._attackMoveTarget;
                e._attackMoveTarget = null;
                e.state = 'attackMove';
                setUnitPath(e, Math.floor(e.target.x / CELL), Math.floor(e.target.y / CELL));
              } else {
                resumePatrolOrIdle(e);
              }
              checkGameOver();
            }
          }
        }
        break;
      }
      case 'hold': {
        const nearby = findNearestHoldTarget(e, def.range);
        if (nearby && dist(e, nearby) <= def.range * CELL && game.frame % 20 === 0) {
          nearby.hp -= def.atk;
          nearby.lastHitFrame = game.frame;
          if (e.team === TEAM_PLAYER || nearby.team === TEAM_PLAYER) AudioManager.attack();
          if (nearby.hp <= 0) {
            recordPlayerKill(e, nearby);
            const targetDef = nearby.kind === 'building' ? BUILDING_DEFS[nearby.type] : UNIT_DEFS[nearby.type];
            addLog(`${def.char} 消灭了 ${targetDef?.char || '敌人'}`);
            checkGameOver();
          }
        }
        break;
      }
      case 'gather': {
        if (e.carrying >= GATHER_AMOUNT) {
          const base = findNearestBase(e.gx, e.gy, e.team);
          if (!base) { transitionToIdle(e); break; }
          const d = dist(e, base);
          if (d < CELL * 3) {
            if (e.team === TEAM_PLAYER) {
              game.minerals += e.carrying;
              game.stats.mineralsGathered += e.carrying;
            } else if (game.currentMapId !== 'dead_of_night') {
              window.aiState.minerals += e.carrying;
            }
            e.carrying = 0;
            e.gatherTimer = 0;
            e.path = [];
            const mineral = findNextGatherTarget(e);
            if (mineral) {
              e.gatherTarget = mineral;
              e.lastGatherTarget = mineral;
              setUnitPath(e, mineral.gx, mineral.gy);
            } else {
              transitionToIdle(e);
            }
          } else {
            if (e.path.length > 0) {
              followPath(e, speed);
            } else {
              const bgx = Math.floor(base.x / CELL);
              const bgy = Math.floor(base.y / CELL);
              setUnitPath(e, bgx, bgy);
              if (e.path.length === 0) moveToward(e, base.x, base.y, speed);
            }
          }
        } else if (hasMineral(e.gatherTarget)) {
          const tx = e.gatherTarget.gx * CELL + CELL / 2;
          const ty = e.gatherTarget.gy * CELL + CELL / 2;
          const d = Math.sqrt((e.x - tx) ** 2 + (e.y - ty) ** 2);
          if (d < CELL) {
            e.gatherTimer++;
            if (e.gatherTimer >= GATHER_TIME) {
              e.carrying = GATHER_AMOUNT;
              e.path = [];
              if (mapLayers.resource[e.gatherTarget.gy]?.[e.gatherTarget.gx] === 1) {
                if (Math.random() < 0.15) {
                  mapLayers.resource[e.gatherTarget.gy][e.gatherTarget.gx] = 0;
                }
              }
            }
          } else {
            if (e.path.length > 0) {
              followPath(e, speed);
            } else {
              setUnitPath(e, e.gatherTarget.gx, e.gatherTarget.gy);
              if (e.path.length === 0) moveToward(e, tx, ty, speed);
            }
          }
        } else {
          const mineral = findNextGatherTarget(e);
          if (mineral) {
            e.gatherTarget = mineral;
            e.lastGatherTarget = mineral;
            e.gatherTimer = 0;
            setUnitPath(e, mineral.gx, mineral.gy);
          } else {
            transitionToIdle(e);
          }
        }
        break;
      }
      case 'build': {
        if (!e.buildTarget) { transitionToIdle(e); break; }
        const building = entities.find(b => b.id === e.buildTarget);
        if (!building || building.hp <= 0) { e.path = []; transitionToIdle(e); break; }
        const d = dist(e, building);
        if (d > CELL * 3) {
          if (e.path.length > 0) {
            followPath(e, speed);
          } else {
            const bgx = Math.floor(building.x / CELL);
            const bgy = Math.floor(building.y / CELL);
            setUnitPath(e, bgx, bgy);
            if (e.path.length === 0) moveToward(e, building.x, building.y, speed);
          }
        } else {
          e.path = [];
          const wasIncomplete = building.buildProgress < building.maxHp;
          building.buildProgress = Math.min(building.maxHp, building.buildProgress + 2);
          if (wasIncomplete && building.buildProgress >= building.maxHp) {
            if (building.team === TEAM_PLAYER && !building._statsBuiltCounted) {
              building._statsBuiltCounted = true;
              game.stats.buildingsBuilt++;
            }
            addLog(`建筑完成: ${BUILDING_DEFS[building.type].desc}`);
            if (building.team === TEAM_PLAYER) AudioManager.build();
            e.buildTarget = null;
            transitionToIdle(e);
          }
        }
        break;
      }
    }
  }

  // 清除死亡实体
  for (let i = entities.length - 1; i >= 0; i--) {
    if (entities[i].hp <= 0) {
      const dead = entities[i];
      if (dead.team === TEAM_PLAYER && dead.kind === 'unit') game.stats.unitsLost++;
      if (dead.kind === 'building') {
        const bDef = BUILDING_DEFS[dead.type];
        for (let dy = 0; dy < bDef.h; dy++) {
          for (let dx = 0; dx < bDef.w; dx++) {
            if (dead.gy + dy < MAP_H && dead.gx + dx < MAP_W) {
              mapLayers.building[dead.gy + dy][dead.gx + dx] = 0;
            }
          }
        }
      }
      entities.splice(i, 1);
    }
  }

  // 单位碰撞分离
  applyUnitSeparation();

  // 战争迷雾更新
  if (game.frame % FOG_UPDATE_INTERVAL === 0) updateFog();

  countPop();

  // AI逻辑 (每120帧执行一次)
  if (game.frame % 120 === 0) enemyAI();

  updateHUD();
}

// ---- 战争迷雾 ----
// 每帧重算视野: 先将 VISIBLE 降级为 EXPLORED, 再用所有玩家实体重新点亮
const game_fogEnabled = true; // 调试可在 console 关闭: window.fogEnabled = false
window.fogEnabled = game_fogEnabled;

function updateFog() {
  if (!window.fogEnabled) {
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) fogMap[y][x] = FOG_VISIBLE;
    }
    return;
  }
  for (let y = 0; y < MAP_H; y++) {
    const row = fogMap[y];
    for (let x = 0; x < MAP_W; x++) {
      if (row[x] === FOG_VISIBLE) row[x] = FOG_EXPLORED;
    }
  }
  for (const e of entities) {
    if (e.team !== TEAM_PLAYER || e.hp <= 0) continue;
    let cx, cy, vision;
    if (e.kind === 'unit') {
      vision = UNIT_DEFS[e.type].vision || 5;
      cx = e.x / CELL;
      cy = e.y / CELL;
    } else {
      const bDef = BUILDING_DEFS[e.type];
      vision = bDef.vision || 4;
      cx = e.gx + bDef.w / 2;
      cy = e.gy + bDef.h / 2;
    }
    const vSq = vision * vision;
    const minX = Math.max(0, Math.floor(cx - vision));
    const maxX = Math.min(MAP_W - 1, Math.ceil(cx + vision));
    const minY = Math.max(0, Math.floor(cy - vision));
    const maxY = Math.min(MAP_H - 1, Math.ceil(cy + vision));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= vSq) fogMap[y][x] = FOG_VISIBLE;
      }
    }
  }
}

// 注: 初始视野计算移到 setupGameForMap() 中，在地图初始化之后才执行

// 判断敌方实体当前是否对玩家可见 (用于渲染过滤 + 指令目标过滤)
// 与渲染逻辑保持一致: 建筑取中心格, 单位取脚下格
function isEnemyVisibleToPlayer(e) {
  if (!window.fogEnabled) return true;
  if (e.team !== TEAM_ENEMY) return true;
  let cgx, cgy;
  if (e.kind === 'building') {
    const bDef = BUILDING_DEFS[e.type];
    cgx = e.gx + Math.floor(bDef.w / 2);
    cgy = e.gy + Math.floor(bDef.h / 2);
  } else {
    cgx = Math.floor(e.x / CELL);
    cgy = Math.floor(e.y / CELL);
  }
  return fogMap[cgy]?.[cgx] === FOG_VISIBLE;
}

function findNearestHoldTarget(unit, range) {
  let best = null, bestDist = Infinity;
  const rangePx = range * CELL;
  for (const e of entities) {
    if (e.hp <= 0 || e.team === unit.team) continue;
    if (unit.team === TEAM_PLAYER && e.team === TEAM_ENEMY && !isEnemyVisibleToPlayer(e)) continue;
    const d = dist(unit, e);
    if (d < rangePx && d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}

// 「亡者之夜」专属敌方 AI:
// 四角的敌方基地周期性生产丧尸/猎杀体/腐尸怪，全部攻击玩家中央基地。
function enemyAIDeadOfNight() {
  const enemyBases = entities.filter(
    e => e.team === TEAM_ENEMY && e.hp > 0 && e.kind === 'building' && e.type === 'base'
  );
  if (enemyBases.length === 0) return;

  // 每个出生点保持 1~2 个生产队列
  for (const eBase of enemyBases) {
    if (eBase.buildProgress < eBase.maxHp) continue;
    if (eBase.queue.length >= 2) continue;
    // 70% 丧尸 / 20% 猎杀体 / 10% 腐尸怪
    const r = Math.random();
    let unitType = 'zombie';
    if (r > 0.9) unitType = 'bloater';
    else if (r > 0.7) unitType = 'berserker';
    eBase.queue.push(unitType);
  }

  // 所有空闲的丧尸系单位 → 攻击玩家基地
  const playerBase = entities.find(
    e => e.team === TEAM_PLAYER && e.hp > 0 && e.kind === 'building' && e.type === 'base'
  );
  if (!playerBase) return;

  const ZOMBIE_TYPES = new Set(['zombie', 'berserker', 'bloater']);
  const zombies = entities.filter(
    e =>
      e.team === TEAM_ENEMY &&
      e.hp > 0 &&
      e.kind === 'unit' &&
      ZOMBIE_TYPES.has(e.type) &&
      e.state === 'idle'
  );
  for (const z of zombies) {
    z.attackTarget = playerBase.id;
    z.state = 'attack';
    z.path = [];
    z.pathRetryFrame = 0;
  }

  // 每 ~10 秒提示一次丧尸潮汐
  if (game.frame > 0 && game.frame % 600 === 0) {
    addLog('🧟 一波丧尸正从四面八方涌来！');
  }
}

function checkGameOver() {
  const playerBases = entities.filter(e => e.team === TEAM_PLAYER && e.kind === 'building' && e.type === 'base' && e.hp > 0);
  const enemyBases = entities.filter(e => e.team === TEAM_ENEMY && e.kind === 'building' && e.type === 'base' && e.hp > 0);
  if (playerBases.length === 0) {
    game.gameOver = true;
    addLog('💀 你的基地被摧毁了... 游戏结束！');
  }
  if (enemyBases.length === 0) {
    game.gameOver = true;
    addLog('🎉 恭喜！你消灭了敌方基地，胜利！');
  }
}

// ---- 渲染 ----
// ---- 主循环 ----
let _gameLoopStarted = false;
function gameLoop() {
  if (!game.paused && !game.gameOver) {
    game.speedAccumulator += game.speed;
    while (game.speedAccumulator >= 1 && !game.gameOver) {
      update();
      game.speedAccumulator -= 1;
    }
  } else {
    game.speedAccumulator = 0;
  }
  render();
  requestAnimationFrame(gameLoop);
}

// ============================================================
//  地图选择界面 (开局显示, 选择后启动游戏)
// ============================================================
function renderMapThumbnail(canvas, mapDef) {
  const W = canvas.width;
  const H = canvas.height;
  const tctx = canvas.getContext('2d');
  // 调用 initFn 让 mapLayers 反映该地图的布局 (会覆盖之前的状态, 但选择后会再调用一次)
  mapDef.initFn();
  const mw = mapDef.mapW;
  const mh = mapDef.mapH;
  const sx = W / mw;
  const sy = H / mh;

  // 背景
  tctx.fillStyle = '#0a1a0a';
  tctx.fillRect(0, 0, W, H);

  for (let gy = 0; gy < mh; gy++) {
    for (let gx = 0; gx < mw; gx++) {
      const terrainType = mapLayers.terrain[gy][gx];
      if (terrainType !== TERRAIN_GRASS) {
        tctx.fillStyle = TERRAIN_PROPS[terrainType].color;
        tctx.fillRect(gx * sx, gy * sy, Math.ceil(sx), Math.ceil(sy));
      }
      if (mapLayers.resource[gy][gx] === 1) {
        tctx.fillStyle = '#44f';
        tctx.fillRect(gx * sx, gy * sy, Math.max(1, sx), Math.max(1, sy));
      }
    }
  }

  // 关键标记：玩家基地 (绿) / 敌方出生点 (红)
  function dot(gx, gy, color, size) {
    tctx.fillStyle = color;
    tctx.fillRect(gx * sx - size / 2, gy * sy - size / 2, size, size);
  }
  if (mapDef.id === 'dead_of_night') {
    dot(39, 29, '#0f0', 8); // 玩家中央基地
    dot(6, 6, '#f44', 6);    // NW
    dot(74, 6, '#f44', 6);   // NE
    dot(6, 54, '#f44', 6);   // SW
    dot(74, 54, '#f44', 6);  // SE
  } else if (mapDef.id === 'war_canyon') {
    dot(5, 34, '#0f0', 8);   // 玩家左下基地
    dot(55, 4, '#f44', 6);   // 敌方右上基地
  } else {
    dot(mapDef.mapW - 5, mapDef.mapH - 5, '#0f0', 8); // 玩家
    dot(4, 4, '#f44', 6); // 敌方
  }
}

function showMapSelection() {
  const overlay = document.getElementById('mapSelectOverlay');
  const container = document.getElementById('mapCardsContainer');
  container.innerHTML = '';

  MAP_REGISTRY.forEach((mapDef) => {
    const card = document.createElement('div');
    card.className = 'map-card';
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 200;
    thumbCanvas.height = 150;
    const title = document.createElement('div');
    title.className = 'map-card-title';
    title.textContent = mapDef.name;
    const desc = document.createElement('div');
    desc.className = 'map-card-desc';
    desc.textContent = mapDef.desc;
    const size = document.createElement('div');
    size.className = 'map-card-size';
    size.textContent = `${mapDef.mapW} × ${mapDef.mapH}`;
    card.appendChild(thumbCanvas);
    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(size);
    card.addEventListener('click', () => startGame(mapDef.id));
    container.appendChild(card);

    // 渲染缩略图 (会调用 mapDef.initFn() 让 mapLayers 反映其布局)
    try {
      renderMapThumbnail(thumbCanvas, mapDef);
    } catch (err) {
      console.warn('Failed to render thumbnail for', mapDef.id, err);
    }
  });

  overlay.style.display = 'flex';
}

function startGame(mapId) {
  const mapDef = MAP_REGISTRY.find(m => m.id === mapId);
  if (!mapDef) {
    console.error('Unknown map id:', mapId);
    return;
  }
  // 重新调用一次确保 mapLayers / fogMap 是该地图的干净状态
  mapDef.initFn();
  setupGameForMap(mapDef);

  // 隐藏地图选择界面
  document.getElementById('mapSelectOverlay').style.display = 'none';

  // 启动主循环（仅启动一次）
  if (!_gameLoopStarted) {
    _gameLoopStarted = true;
    gameLoop();
  }
}

// 开局展示地图选择界面
window.addEventListener('load', showMapSelection);
