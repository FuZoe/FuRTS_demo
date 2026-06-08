const AI_PHASES = {
  ECONOMY: 0,
  HARASS: 1,
  BUILDUP: 2,
  ALLOUT: 3,
};

window.aiState = {
  minerals: 250,
  lastHarassFrame: -9999,
  lastAllOutFrame: -9999,
  lastPhase: null,
  attackRoute: 0,
};

function getAIPhase() {
  const minutes = game.frame / 3600;
  if (minutes < 5) return AI_PHASES.ECONOMY;
  if (minutes < 8) return AI_PHASES.HARASS;
  if (minutes < 12) return AI_PHASES.BUILDUP;
  return AI_PHASES.ALLOUT;
}

function getAIPhaseName(phase) {
  return ['经济扩张', '骚扰', '集结', '总攻'][phase] || '未知';
}

function countAITotalPop(enemyUnits, enemyBuildings) {
  let used = 0;
  let max = 10;
  for (const u of enemyUnits) used += UNIT_DEFS[u.type].popCost;
  for (const b of enemyBuildings) {
    if (b.type === 'supply' && b.buildProgress >= b.maxHp) max += 10;
    for (const type of b.queue) used += UNIT_DEFS[type].popCost;
  }
  return { used, max };
}

function aiCanQueueUnit(type, popInfo) {
  const def = UNIT_DEFS[type];
  return window.aiState.minerals >= def.cost && popInfo.used + def.popCost <= popInfo.max;
}

function aiQueueUnit(building, type, popInfo) {
  if (!building || building.buildProgress < building.maxHp || building.queue.length > 0) return false;
  if (!aiCanQueueUnit(type, popInfo)) return false;
  window.aiState.minerals -= UNIT_DEFS[type].cost;
  building.queue.push(type);
  popInfo.used += UNIT_DEFS[type].popCost;
  return true;
}

function findAIPlacement(base, type, enemyBuildings) {
  const anchors = [
    { dx: 4, dy: 0 }, { dx: 0, dy: 4 }, { dx: 4, dy: 4 },
    { dx: 7, dy: 0 }, { dx: 0, dy: 7 }, { dx: 7, dy: 4 },
    { dx: 4, dy: 7 }, { dx: 8, dy: 8 }, { dx: 2, dy: 7 },
  ];
  const phaseOffset = enemyBuildings.length % anchors.length;
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[(i + phaseOffset) % anchors.length];
    const gx = base.gx + a.dx;
    const gy = base.gy + a.dy;
    if (canPlaceBuilding(type, gx, gy)) return { gx, gy };
  }
  for (let radius = 2; radius <= 10; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const gx = base.gx + dx;
        const gy = base.gy + dy;
        if (canPlaceBuilding(type, gx, gy)) return { gx, gy };
      }
    }
  }
  return null;
}

function aiBuildNearBase(base, type, enemyBuildings) {
  const def = BUILDING_DEFS[type];
  if (window.aiState.minerals < def.cost) return false;
  const spot = findAIPlacement(base, type, enemyBuildings);
  if (!spot) return false;
  window.aiState.minerals -= def.cost;
  const building = createBuilding(type, spot.gx, spot.gy, TEAM_ENEMY);
  building.buildProgress = building.maxHp;
  addLog(`敌方建造完成: ${def.desc}`);
  return true;
}

function getAIRallyPoint(base, routeIndex = 0) {
  const routes = [
    { gx: base.gx + 9, gy: base.gy + 2 },
    { gx: base.gx + 2, gy: base.gy + 9 },
    { gx: base.gx + 8, gy: base.gy + 8 },
  ];
  const route = routes[routeIndex % routes.length];
  return {
    gx: Math.max(1, Math.min(MAP_W - 2, route.gx)),
    gy: Math.max(1, Math.min(MAP_H - 2, route.gy)),
  };
}

function getAIFlankPoint(routeIndex, target) {
  const routes = [
    { gx: Math.max(1, target.gx - 8), gy: Math.max(1, target.gy - 2) },
    { gx: Math.max(1, target.gx - 2), gy: Math.max(1, target.gy - 8) },
    { gx: Math.max(1, target.gx - 10), gy: Math.max(1, target.gy - 10) },
  ];
  return routes[routeIndex % routes.length];
}

function commandAIMove(unit, point) {
  const targetX = point.gx * CELL + CELL / 2;
  const targetY = point.gy * CELL + CELL / 2;
  if (unit.state === 'move' && unit.target?.x === targetX && unit.target?.y === targetY) return;
  applyCommand(unit, { type: 'move', targetGrid: point });
}

function commandAIAttack(unit, target, routeIndex) {
  const flank = getAIFlankPoint(routeIndex, target);
  unit.actionQueue = [{ type: 'attack', targetId: target.id }];
  commandAIMove(unit, flank);
}

function findAIHarassTarget() {
  const playerWorkers = entities.filter(e => e.team === TEAM_PLAYER && e.hp > 0 && e.kind === 'unit' && e.type === 'worker');
  if (playerWorkers.length > 0) return playerWorkers[Math.floor(Math.random() * playerWorkers.length)];
  return entities.find(e => e.team === TEAM_PLAYER && e.hp > 0 && e.kind === 'building' && e.type === 'base')
    || entities.find(e => e.team === TEAM_PLAYER && e.hp > 0);
}

function enemyAI() {
  if (game.currentMapId === 'dead_of_night') {
    enemyAIDeadOfNight();
    return;
  }

  const phase = getAIPhase();
  if (window.aiState.lastPhase !== phase) {
    window.aiState.lastPhase = phase;
    addLog(`敌方 AI 阶段: ${getAIPhaseName(phase)}`);
  }

  const enemyUnits = entities.filter(e => e.team === TEAM_ENEMY && e.hp > 0 && e.kind === 'unit');
  const enemyBuildings = entities.filter(e => e.team === TEAM_ENEMY && e.hp > 0 && e.kind === 'building');
  const eBase = enemyBuildings.find(b => b.type === 'base' && b.buildProgress >= b.maxHp);
  if (!eBase) return;

  const enemyWorkers = enemyUnits.filter(u => u.type === 'worker');
  const enemyArmy = enemyUnits.filter(u => u.type !== 'worker');
  const completedBuildings = enemyBuildings.filter(b => b.buildProgress >= b.maxHp);
  const popInfo = countAITotalPop(enemyUnits, enemyBuildings);

  for (const w of enemyWorkers) {
    if (w.state === 'idle') {
      const mineral = findNearestMineral(w.gx, w.gy);
      if (mineral) {
        applyCommand(w, { type: 'gather', gatherTarget: mineral });
        w.lastGatherTarget = mineral;
      }
    }
  }

  const buildingSupply = enemyBuildings.some(b => b.type === 'supply' && b.buildProgress < b.maxHp);
  if (popInfo.used >= popInfo.max - 2 && !buildingSupply) {
    aiBuildNearBase(eBase, 'supply', enemyBuildings);
  }

  const barracksCount = enemyBuildings.filter(b => b.type === 'barracks').length;
  const factoryCount = enemyBuildings.filter(b => b.type === 'factory').length;
  if (barracksCount === 0 && game.frame > 600) aiBuildNearBase(eBase, 'barracks', enemyBuildings);
  if (phase >= AI_PHASES.BUILDUP && barracksCount < 2) aiBuildNearBase(eBase, 'barracks', enemyBuildings);
  if (phase >= AI_PHASES.BUILDUP && factoryCount === 0 && game.frame > 600) aiBuildNearBase(eBase, 'factory', enemyBuildings);

  if (enemyWorkers.length < 5) aiQueueUnit(eBase, 'worker', popInfo);

  const barracks = completedBuildings.filter(b => b.type === 'barracks');
  const factories = completedBuildings.filter(b => b.type === 'factory');
  for (const b of barracks) {
    const unitType = phase >= AI_PHASES.HARASS && Math.random() < 0.55 ? 'ranger' : 'soldier';
    aiQueueUnit(b, unitType, popInfo);
  }
  for (const f of factories) {
    if (phase >= AI_PHASES.BUILDUP) aiQueueUnit(f, 'tank', popInfo);
  }

  const rally = getAIRallyPoint(eBase, window.aiState.attackRoute);
  for (const unit of enemyArmy) {
    if ((unit.state === 'idle' || unit.state === 'move') && !unit.attackTarget && unit.actionQueue.length === 0 && phase >= AI_PHASES.BUILDUP) {
      commandAIMove(unit, rally);
    }
  }

  if (phase === AI_PHASES.HARASS && game.frame - window.aiState.lastHarassFrame > 1800) {
    const harassers = enemyArmy
      .filter(u => u.state === 'idle' || u.state === 'move')
      .sort((a, b) => UNIT_DEFS[b.type].speed - UNIT_DEFS[a.type].speed)
      .slice(0, 3);
    const target = findAIHarassTarget();
    if (target && harassers.length >= 2) {
      window.aiState.lastHarassFrame = game.frame;
      window.aiState.attackRoute++;
      harassers.forEach((u, i) => commandAIAttack(u, target, window.aiState.attackRoute + i));
      addLog('敌方骚扰小队正在攻击矿区');
    }
  }

  if (phase === AI_PHASES.ALLOUT && game.frame - window.aiState.lastAllOutFrame > 2400) {
    const target = entities.find(e => e.team === TEAM_PLAYER && e.hp > 0 && e.kind === 'building' && e.type === 'base')
      || entities.find(e => e.team === TEAM_PLAYER && e.hp > 0);
    const attackers = enemyArmy.filter(u => (u.state === 'idle' || u.state === 'move' || !u.attackTarget) && u.actionQueue.length === 0);
    if (target && attackers.length >= 4) {
      window.aiState.lastAllOutFrame = game.frame;
      window.aiState.attackRoute++;
      attackers.forEach((u, i) => commandAIAttack(u, target, window.aiState.attackRoute + i));
      addLog('敌军发起全面进攻');
    }
  }
}

window.enemyAI = enemyAI;
