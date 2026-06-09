function getSelectedProductionBuildings(type = null) {
  return game.selected
    .map(id => entities.find(e => e.id === id))
    .filter(e => {
      if (!e || e.kind !== 'building' || e.team !== TEAM_PLAYER || e.buildProgress < e.maxHp) return false;
      const bDef = BUILDING_DEFS[e.type];
      return bDef.produces && (!type || bDef.produces.includes(type));
    });
}

function getShortestQueueBuilding(type) {
  return getSelectedProductionBuildings(type)
    .sort((a, b) => a.queue.length - b.queue.length)[0];
}

function trainUnit(type, buildingId) {
  const building = buildingId ? entities.find(e => e.id === buildingId) : getShortestQueueBuilding(type);
  if (!building) return;
  const bDef = BUILDING_DEFS[building.type];
  if (building.kind !== 'building' || building.team !== TEAM_PLAYER || building.buildProgress < building.maxHp || !bDef.produces?.includes(type)) return;
  const uDef = UNIT_DEFS[type];
  if (game.minerals < uDef.cost) { addLog('矿石不足！'); AudioManager.error(); return; }
  if (game.pop + uDef.popCost > game.maxPop) { addLog('人口上限！需要建造人口房。'); AudioManager.error(); return; }
  game.minerals -= uDef.cost;
  building.queue.push(type);
  addLog(`开始生产: ${uDef.desc}`);
  updateSidebar();
}

function researchUpgrade(key, buildingId) {
  const building = entities.find(e => e.id === buildingId);
  const upgrade = UPGRADES[key];
  if (!building || !upgrade || building.kind !== 'building' || building.type !== 'base') return;
  if (building.team !== TEAM_PLAYER || building.buildProgress < building.maxHp) return;

  const status = getUpgradeStatus(key, building);
  if (!status.available) {
    if (status.reason) addLog(status.reason);
    return;
  }

  game.minerals -= upgrade.cost;
  building.researchQueue.push(key);
  addLog(`开始研究: ${upgrade.name}`);
  updateSidebar();
}
function cancelProduction(buildingId, queueIndex) {
  const building = entities.find(e => e.id === buildingId);
  if (!building || building.team !== TEAM_PLAYER || !building.queue || queueIndex < 0 || queueIndex >= building.queue.length) return false;

  const unitType = building.queue[queueIndex];
  const uDef = UNIT_DEFS[unitType];
  if (!uDef) return false;

  if (queueIndex === 0) {
    building.queueTimer = 0;
  }
  building.queue.splice(queueIndex, 1);
  game.minerals += uDef.cost;
  addLog(`取消生产: ${uDef.desc} (+${uDef.cost}矿)`);
  updateSidebar();
  return true;
}

function startBuild(type) {
  const bDef = BUILDING_DEFS[type];
  if (game.minerals < bDef.cost) { addLog('矿石不足！'); AudioManager.error(); return; }
  game.buildMode = type;
  game.commandMode = null;
  addLog(`进入建造模式: ${bDef.desc} - 左键放置`);
  updateSidebar();
}

function startPatrolCommand() {
  const hasUnitSelected = game.selected
    .map(id => entities.find(e => e.id === id))
    .some(e => e && e.kind === 'unit' && e.team === TEAM_PLAYER);
  if (!hasUnitSelected) return;
  game.buildMode = null;
  game.buildPreview = null;
  game.commandMode = 'patrol';
  addLog('进入巡逻模式：左键选择巡逻点');
  updateSidebar();
}

function setAttackMoveMode(enabled, queued = false) {
  game.attackMoveMode = enabled;
  game.attackMoveQueued = enabled && queued;
  canvas.style.cursor = enabled ? 'crosshair' : '';
  updateSidebar();
}

function issueAttackMoveCommand(mx, my, isShiftHeld = false) {
  if (game.selected.length === 0) return;
  const gx = Math.floor((mx + camera.x) / CELL);
  const gy = Math.floor((my + camera.y) / CELL);
  const selectedUnits = game.selected
    .map(id => entities.find(e => e.id === id))
    .filter(e => e && e.kind === 'unit' && e.team === TEAM_PLAYER);
  if (selectedUnits.length === 0) return;

  const count = selectedUnits.length;
  const cols = Math.ceil(Math.sqrt(count));
  selectedUnits.forEach((u, i) => {
    let command = { type: 'attackMove', targetGrid: { gx, gy } };
    if (!isShiftHeld) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      command = { type: 'attackMove', targetGrid: clampGrid(gx + col, gy + row) };
    }

    if (isShiftHeld) {
      u.actionQueue.push(command);
      if (u.state === 'idle') transitionToIdle(u);
    } else {
      u.actionQueue = [];
      applyCommand(u, command);
    }
  });

  addLog(isShiftHeld ? '⚔️ 排队攻击移动' : '⚔️ 攻击移动');
}

function cancelBuild() {
  game.buildMode = null;
  game.buildPreview = null;
  game.commandMode = null;
  updateSidebar();
}

function getSelectedWorkers() {
  return game.selected
    .map(id => entities.find(e => e.id === id))
    .filter(e => e && e.kind === 'unit' && e.type === 'worker' && e.team === TEAM_PLAYER && e.hp > 0);
}

function getWorkersBuilding(buildingId, excludedIds = new Set()) {
  return entities.filter(e =>
    e.kind === 'unit' &&
    e.type === 'worker' &&
    e.team === TEAM_PLAYER &&
    e.hp > 0 &&
    e.buildTarget === buildingId &&
    !excludedIds.has(e.id)
  );
}

function sortWorkersForBuild(workers, building) {
  return [...workers].sort((a, b) => {
    const aBusy = (a.state === 'build' || a.state === 'attack') ? 1 : 0;
    const bBusy = (b.state === 'build' || b.state === 'attack') ? 1 : 0;
    if (aBusy !== bBusy) return aBusy - bBusy;
    return dist(a, building) - dist(b, building);
  });
}

function assignWorkersToBuild(building, workers, isShiftHeld = false, maxWorkers = 1) {
  if (!building || building.kind !== 'building' || building.team !== TEAM_PLAYER || building.buildProgress >= building.maxHp) return 0;
  const selectedWorkerIds = new Set(workers.map(w => w.id));
  const existingBuilders = getWorkersBuilding(building.id, selectedWorkerIds).length;
  const needed = Math.max(0, maxWorkers - existingBuilders);
  if (needed === 0) return 0;

  const candidates = sortWorkersForBuild(workers, building).slice(0, needed);
  const command = { type: 'build', buildTargetId: building.id };
  for (const worker of candidates) {
    if (isShiftHeld) {
      worker.actionQueue.push(command);
      if (worker.state === 'idle') transitionToIdle(worker);
    } else {
      worker.actionQueue = [];
      applyCommand(worker, command);
    }
  }
  return candidates.length;
}

function placeBuildingAtMouse(gx, gy) {
  if (!game.buildMode) return;
  if (!canPlaceBuilding(game.buildMode, gx, gy)) {
    addLog('无法在此处建造！');
    AudioManager.error();
    return;
  }
  const bDef = BUILDING_DEFS[game.buildMode];
  if (game.minerals < bDef.cost) { addLog('矿石不足！'); AudioManager.error(); return; }
  game.minerals -= bDef.cost;
  const building = createBuilding(game.buildMode, gx, gy, TEAM_PLAYER);

  assignWorkersToBuild(building, getSelectedWorkers());

  addLog(`开始建造: ${bDef.desc}`);
  game.buildMode = null;
  game.buildPreview = null;
  updateSidebar();
}

// 把建筑当前的集结点指令应用到新生产的单位上
function applyRallyPoint(building, unit) {
  if (!building.rallyPoint || !unit) return;
  const rp = building.rallyPoint;
  if (rp.type === 'mineral' && unit.type === 'worker') {
    unit.state = 'gather';
    unit.gatherTarget = { gx: rp.gx, gy: rp.gy };
    unit.lastGatherTarget = unit.gatherTarget;
    unit.gatherTimer = 0;
    setUnitPath(unit, rp.gx, rp.gy);
  } else {
    unit.state = 'move';
    unit.target = {
      x: rp.gx * CELL + CELL / 2,
      y: rp.gy * CELL + CELL / 2,
    };
    setUnitPath(unit, rp.gx, rp.gy);
  }
}

// ---- 指令排队系统 ----
function clearPatrol(unit) {
  unit.patrolPointA = null;
  unit.patrolPointB = null;
  unit.patrolToB = true;
  unit._patrolState = null;
}

function resumePatrolOrIdle(unit) {
  if (unit._patrolState) {
    const patrolState = unit._patrolState;
    unit.patrolPointA = patrolState.pointA;
    unit.patrolPointB = patrolState.pointB;
    unit.patrolToB = patrolState.toB;
    unit._patrolState = null;
    unit.target = null;
    unit.attackTarget = null;
    unit.gatherTarget = null;
    unit.buildTarget = null;
    unit.path = [];
    unit.state = 'patrol';
    const dest = unit.patrolToB ? unit.patrolPointB : unit.patrolPointA;
    if (dest) setUnitPath(unit, Math.floor(dest.x / CELL), Math.floor(dest.y / CELL));
  } else {
    transitionToIdle(unit);
  }
}

function applyCommand(unit, command) {
  switch (command.type) {
    case 'move':
      clearPatrol(unit);
      unit.state = 'move';
      unit.target = {
        x: command.targetGrid.gx * CELL + CELL / 2,
        y: command.targetGrid.gy * CELL + CELL / 2,
      };
      unit.attackTarget = null;
      unit._attackMoveTarget = null;
      unit.gatherTarget = null;
      unit.buildTarget = null;
      setUnitPath(unit, command.targetGrid.gx, command.targetGrid.gy);
      break;
    case 'attackMove':
      clearPatrol(unit);
      unit.state = 'attackMove';
      unit.target = {
        x: command.targetGrid.gx * CELL + CELL / 2,
        y: command.targetGrid.gy * CELL + CELL / 2,
      };
      unit.attackTarget = null;
      unit._attackMoveTarget = null;
      unit.gatherTarget = null;
      unit.lastGatherTarget = null;
      unit.buildTarget = null;
      setUnitPath(unit, command.targetGrid.gx, command.targetGrid.gy);
      break;
    case 'attack': {
      const target = entities.find(t => t.id === command.targetId);
      if (!target || target.hp <= 0) break;
      clearPatrol(unit);
      unit.state = 'attack';
      unit.attackTarget = command.targetId;
      unit._attackMoveTarget = null;
      unit.target = null;
      unit.gatherTarget = null;
      unit.lastGatherTarget = null;
      unit.buildTarget = null;
      unit.path = [];
      unit.pathRetryFrame = 0;
      break;
    }
    case 'gather':
      if (unit.type !== 'worker') break;
      clearPatrol(unit);
      unit.state = 'gather';
      unit.gatherTarget = command.gatherTarget;
      unit.lastGatherTarget = command.gatherTarget;
      unit.target = null;
      unit.attackTarget = null;
      unit._attackMoveTarget = null;
      unit.buildTarget = null;
      unit.gatherTimer = 0;
      setUnitPath(unit, command.gatherTarget.gx, command.gatherTarget.gy);
      break;
    case 'build': {
      if (unit.type !== 'worker') break;
      const building = entities.find(b => b.id === command.buildTargetId);
      if (!building || building.hp <= 0) break;
      clearPatrol(unit);
      unit.state = 'build';
      unit.buildTarget = command.buildTargetId;
      unit.target = null;
      unit.attackTarget = null;
      unit._attackMoveTarget = null;
      unit.gatherTarget = null;
      unit.lastGatherTarget = null;
      const bgx = Math.floor(building.x / CELL);
      const bgy = Math.floor(building.y / CELL);
      setUnitPath(unit, bgx, bgy);
      break;
    }
    case 'patrol':
      unit.state = 'patrol';
      unit.target = null;
      unit.attackTarget = null;
      unit._attackMoveTarget = null;
      unit.gatherTarget = null;
      unit.lastGatherTarget = null;
      unit.buildTarget = null;
      unit.patrolPointA = { x: unit.x, y: unit.y };
      unit.patrolPointB = {
        x: command.targetGrid.gx * CELL + CELL / 2,
        y: command.targetGrid.gy * CELL + CELL / 2,
      };
      unit.patrolToB = true;
      unit._patrolState = null;
      setUnitPath(unit, command.targetGrid.gx, command.targetGrid.gy);
      break;
  }
}

function isCommandValid(command, unit) {
  if (!command || !unit) return false;

  switch (command.type) {
    case 'move':
      return true;
    case 'attackMove':
      return !!command.targetGrid;
    case 'patrol': {
      if (!command.targetGrid) return false;
      const { gx, gy } = command.targetGrid;
      return gx >= 0 && gx < MAP_W && gy >= 0 && gy < MAP_H;
    }
    case 'attack': {
      const target = entities.find(t => t.id === command.targetId);
      return !!target && target.hp > 0;
    }
    case 'gather': {
      if (unit.type !== 'worker' || !command.gatherTarget) return false;
      const { gx, gy } = command.gatherTarget;
      return mapLayers.resource[gy]?.[gx] === 1;
    }
    case 'build': {
      if (unit.type !== 'worker') return false;
      const building = entities.find(b => b.id === command.buildTargetId);
      return !!building && building.hp > 0 && building.buildProgress < building.maxHp;
    }
    default:
      return false;
  }
}

function transitionToIdle(unit) {
  while (unit.actionQueue.length > 0) {
    const nextCommand = unit.actionQueue.shift();
    if (isCommandValid(nextCommand, unit)) {
      applyCommand(unit, nextCommand);
      return;
    }
  }

  if (unit.type === 'worker' && unit.lastGatherTarget && unit.carrying < GATHER_AMOUNT) {
    const gt = unit.lastGatherTarget;
    if (mapLayers.resource[gt.gy]?.[gt.gx] === 1) {
      unit.state = 'gather';
      unit.gatherTarget = gt;
      unit.gatherTimer = 0;
      setUnitPath(unit, gt.gx, gt.gy);
      return;
    }

    const mineral = findLeastLoadedMineral(unit.gx, unit.gy);
    if (mineral) {
      unit.state = 'gather';
      unit.gatherTarget = mineral;
      unit.lastGatherTarget = mineral;
      unit.gatherTimer = 0;
      setUnitPath(unit, mineral.gx, mineral.gy);
      return;
    }

    unit.lastGatherTarget = null;
  }

  unit.state = 'idle';
}

function stopSelectedUnits() {
  let stopped = 0;

  for (const id of game.selected) {
    const unit = entities.find(e => e.id === id);
    if (!isStopCommandTarget(unit)) continue;

    unit.state = 'idle';
    unit.actionQueue = [];
    unit.path = [];
    unit.target = null;
    unit.attackTarget = null;
    unit._attackMoveTarget = null;
    unit.gatherTarget = null;
    unit.buildTarget = null;
    clearPatrol(unit);
    unit.gatherTimer = 0;
    unit.pathRetryFrame = 0;
    stopped++;
  }

  if (stopped > 0) {
    addLog('停止');
    updateSidebar();
  }

  return stopped;
}

function holdSelectedUnits() {
  let heldCount = 0;

  for (const id of game.selected) {
    const unit = entities.find(en => en.id === id);
    if (!unit || unit.kind !== 'unit' || unit.team !== TEAM_PLAYER) continue;

    clearPatrol(unit);
    unit.state = 'hold';
    unit.actionQueue = [];
    unit.path = [];
    unit.target = null;
    unit.attackTarget = null;
    unit.gatherTarget = null;
    unit.buildTarget = null;
    unit.gatherTimer = 0;
    unit.pathRetryFrame = 0;
    heldCount++;
  }

  if (heldCount > 0) {
    addLog('🛡 驻守');
    updateSidebar();
  }

  return heldCount;
}

function issueCommand(mx, my, isShiftHeld = false) {
  if (game.selected.length === 0) return;

  const world = screenToWorld(mx, my);
  const gx = Math.floor(world.x / CELL);
  const gy = Math.floor(world.y / CELL);

  // 选中己方已建造完成的建筑时，右键设置集结点
  const selectedBuildings = game.selected
    .map(id => entities.find(e => e.id === id))
    .filter(e => e && e.kind === 'building' && e.team === TEAM_PLAYER && e.buildProgress >= e.maxHp);

  if (!game.commandMode && selectedBuildings.length > 0) {
    const isMineral = mapLayers.resource[gy]?.[gx] === 1;
    const rpType = isMineral ? 'mineral' : 'move';
    for (const b of selectedBuildings) {
      b.rallyPoint = { gx, gy, type: rpType };
    }
    addLog(isMineral ? '集结点设为矿区 ⛏️' : '集结点已设置 🚩');
    AudioManager.move();
    updateSidebar();
    return;
  }

  const selectedUnits = game.selected
    .map(id => entities.find(e => e.id === id))
    .filter(e => e && e.kind === 'unit' && e.team === TEAM_PLAYER);

  if (selectedUnits.length === 0) return;

  const rawTarget = entityAt(gx, gy);
  // 战争迷雾: 不可见的敌方实体不能被右键直接命中 (防止依靠记忆攻击迷雾下的建筑/单位)
  const target = (rawTarget && rawTarget.team === TEAM_ENEMY && !isEnemyVisibleToPlayer(rawTarget))
    ? null
    : rawTarget;

  // 构建指令对象
  let command = null;
  let commandLog = null;

  if (game.commandMode === 'patrol') {
    command = { type: 'patrol', targetGrid: { gx, gy } };
    commandLog = { queued: '排队巡逻', immediate: '开始巡逻' };
  } else if (target && target.team === TEAM_ENEMY) {
    command = { type: 'attack', targetId: target.id };
    commandLog = { queued: '⚔️ 排队攻击', immediate: '⚔️ 命令攻击!' };
  } else if (mapLayers.resource[gy]?.[gx] === 1) {
    command = { type: 'gather', gatherTarget: { gx, gy } };
    commandLog = { queued: '⛏️ 排队采矿', immediate: '⛏️ 前往采矿' };
  } else if (target && target.kind === 'building' && target.team === TEAM_PLAYER && target.buildProgress < target.maxHp) {
    command = { type: 'build', buildTargetId: target.id };
    commandLog = { queued: '🔨 排队建造', immediate: '🔨 前往建造' };
  } else {
    command = { type: 'move', targetGrid: { gx, gy } };
    commandLog = { queued: '🚶 排队移动', immediate: null };
  }

  // 采矿指令立即执行时，使用分散采矿逻辑（工人均匀分配到不同矿格）
  if (command.type === 'gather' && !isShiftHeld) {
    const workers = selectedUnits.filter(u => u.type === 'worker');
    if (workers.length > 0) {
      const mineralCells = findMineralPatchCells(gx, gy);
      if (mineralCells.length > 0) {
        for (const w of workers) { w.actionQueue = []; }
        distributeWorkersToMinerals(workers, mineralCells);
      }
    }
    addLog(commandLog.immediate);
    return;
  }

  if (command.type === 'build') {
    const workers = selectedUnits.filter(u => u.type === 'worker');
    const building = entities.find(b => b.id === command.buildTargetId);
    const assigned = assignWorkersToBuild(building, workers, isShiftHeld);
    if (assigned > 0) {
      addLog(isShiftHeld ? commandLog.queued : commandLog.immediate);
      AudioManager.move();
    }
    return;
  }

  const count = selectedUnits.length;
  const cols = Math.ceil(Math.sqrt(count));

  selectedUnits.forEach((u, i) => {
    if (isShiftHeld) {
      // 排队指令不使用阵型偏移，所有单位共享同一目标点，确保同步到达
      u.actionQueue.push(command);
      if (u.state === 'idle') {
        transitionToIdle(u);
      }
    } else {
      // 立即执行：对移动指令计算阵型偏移
      let cmd = command;
      if (command.type === 'move' || command.type === 'attackMove' || command.type === 'patrol') {
        const row = Math.floor(i / cols);
        const col = i % cols;
        cmd = { type: command.type, targetGrid: clampGrid(gx + col, gy + row) };
      }
      u.actionQueue = [];
      applyCommand(u, cmd);
    }
  });

  if (isShiftHeld) {
    const leader = selectedUnits.find(u => isCommandValid(command, u));
    if (leader) {
      const queueLength = leader.actionQueue.length + (leader.state !== 'idle' ? 1 : 0);
      addLog(`${commandLog.queued} (队列: ${queueLength}个任务)`);
    } else {
      addLog(commandLog.queued);
    }
  } else if (commandLog.immediate) {
    addLog(commandLog.immediate);
  }

  if (command.type === 'move' || command.type === 'attackMove' || command.type === 'gather' || command.type === 'build' || command.type === 'patrol') {
    AudioManager.move();
  }
  if (game.commandMode) {
    game.commandMode = null;
    updateSidebar();
  }
}
