// ---- 输入处理 ----
canvas.addEventListener('mousedown', (e) => {
  const mx = e.offsetX;
  const my = e.offsetY;

  if (e.button === 0) {
    if (game.commandMode) {
      issueCommand(mx, my, e.shiftKey);
      return;
    }
    if (game.buildMode) {
      const world = screenToWorld(mx, my);
      const gx = Math.floor(world.x / CELL);
      const gy = Math.floor(world.y / CELL);
      placeBuildingAtMouse(gx, gy);
      return;
    }
    if (game.attackMoveMode) {
      issueAttackMoveCommand(mx, my, game.attackMoveQueued || e.shiftKey);
      setAttackMoveMode(false);
      return;
    }
    game.dragStart = { x: mx, y: my };
    game.dragEnd = null;
  }
  if (e.button === 2) {
    e.preventDefault();
    if (game.attackMoveMode) {
      setAttackMoveMode(false);
      return;
    }
    if (game.commandMode) {
      game.commandMode = null;
      updateSidebar();
      return;
    }
    if (game.buildMode) {
      cancelBuild();
      return;
    }
    issueCommand(mx, my, e.shiftKey);
  }
});

canvas.addEventListener('mousemove', (e) => {
  const mx = e.offsetX;
  const my = e.offsetY;

  if (game.buildMode) {
    const world = screenToWorld(mx, my);
    game.buildPreview = {
      gx: Math.floor(world.x / CELL),
      gy: Math.floor(world.y / CELL),
    };
  }

  if (game.dragStart) {
    game.dragEnd = { x: mx, y: my };
  }
});

canvas.addEventListener('mouseup', (e) => {
  if (e.button === 0 && game.dragStart) {
    const mx = e.offsetX;
    const my = e.offsetY;
    const dx = Math.abs(mx - game.dragStart.x);
    const dy = Math.abs(my - game.dragStart.y);

    if (dx < 5 && dy < 5) {
      const world = screenToWorld(mx, my);
      const gx = Math.floor(world.x / CELL);
      const gy = Math.floor(world.y / CELL);

      // Double-click: select all same type on screen
      const now = Date.now();
      const isDoubleClick = (now - (game._lastClickTime || 0) < 400) &&
        Math.abs(mx - (game._lastClickX || 0)) < 10 &&
        Math.abs(my - (game._lastClickY || 0)) < 10;
      game._lastClickTime = now;
      game._lastClickX = mx;
      game._lastClickY = my;

      if (isDoubleClick) {
        const target = entityAt(gx, gy);
        if (target && target.team === TEAM_PLAYER && target.kind === 'unit') {
          if (!e.shiftKey) game.selected = [];
          for (const ent of entities) {
            if (ent.hp <= 0 || ent.team !== TEAM_PLAYER || ent.kind !== 'unit') continue;
            if (ent.type !== target.type) continue;
            if (isWorldPointOnScreen(ent.x, ent.y)) {
              if (!game.selected.includes(ent.id)) game.selected.push(ent.id);
            }
          }
        }
      } else {
        selectAt(gx, gy, e.shiftKey, e.ctrlKey);
      }
    } else {
      boxSelect(game.dragStart, { x: mx, y: my }, e.shiftKey);
    }
    game.dragStart = null;
    game.dragEnd = null;
    if (game.selected.length > 0) AudioManager.select();
    updateSidebar();
  }
});

// 禁用整个页面的浏览器右键菜单（游戏中右键用于下达指令）
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  return false;
}, { capture: true });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();

  const mx = e.offsetX;
  const my = e.offsetY;
  const beforeZoomWorld = screenToWorld(mx, my);
  const zoomFactor = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
  const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom * zoomFactor));
  if (nextZoom === camera.zoom) return;

  camera.zoom = nextZoom;
  camera.x = beforeZoomWorld.x - mx / camera.zoom;
  camera.y = beforeZoomWorld.y - my / camera.zoom;
  clampCamera();
}, { passive: false });

function selectAt(gx, gy, additive, ctrlKey) {
  const target = entityAt(gx, gy);

  // Ctrl+click: select all same-type units on screen
  if (ctrlKey && target && target.team === TEAM_PLAYER && target.kind === 'unit') {
    if (!additive) game.selected = [];
    for (const e of entities) {
      if (e.hp <= 0 || e.team !== TEAM_PLAYER || e.kind !== 'unit') continue;
      if (e.type !== target.type) continue;
      // Check if on screen
      if (isWorldPointOnScreen(e.x, e.y)) {
        if (!game.selected.includes(e.id)) game.selected.push(e.id);
      }
    }
    return;
  }

  if (!additive) game.selected = [];
  if (target && target.team === TEAM_PLAYER) {
    if (!game.selected.includes(target.id)) {
      game.selected.push(target.id);
    }
  }

  // Reset sub-group state on new selection
  game._subGroupType = null;
  game._fullSelection = null;
}

function boxSelect(start, end, additive) {
  const worldStart = screenToWorld(start.x, start.y);
  const worldEnd = screenToWorld(end.x, end.y);
  const x1 = Math.min(worldStart.x, worldEnd.x);
  const y1 = Math.min(worldStart.y, worldEnd.y);
  const x2 = Math.max(worldStart.x, worldEnd.x);
  const y2 = Math.max(worldStart.y, worldEnd.y);

  if (!additive) game.selected = [];

  const unitsInBox = [];
  const buildingsInBox = [];
  for (const e of entities) {
    if (e.hp <= 0 || e.team !== TEAM_PLAYER) continue;
    if (e.kind === 'unit') {
      if (e.x >= x1 && e.x <= x2 && e.y >= y1 && e.y <= y2) unitsInBox.push(e);
    } else if (e.kind === 'building') {
      const bDef = BUILDING_DEFS[e.type];
      const left = e.gx * CELL;
      const top = e.gy * CELL;
      const right = left + bDef.w * CELL;
      const bottom = top + bDef.h * CELL;
      if (right >= x1 && left <= x2 && bottom >= y1 && top <= y2) buildingsInBox.push(e);
    }
  }

  const picked = unitsInBox.length > 0 ? unitsInBox : buildingsInBox;
  for (const e of picked) {
    if (!game.selected.includes(e.id)) game.selected.push(e.id);
  }
}

function minimapEventToPosition(e) {
  const rect = mmCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const worldX = (mx / mmCanvas.width) * MAP_W * CELL;
  const worldY = (my / mmCanvas.height) * MAP_H * CELL;
  return {
    worldX,
    worldY,
    ...clampGrid(Math.floor(worldX / CELL), Math.floor(worldY / CELL)),
  };
}

// 小地图点击
mmCanvas.addEventListener('click', (e) => {
  const { worldX, worldY } = minimapEventToPosition(e);
  camera.x = worldX - getViewportWorldWidth() / 2;
  camera.y = worldY - getViewportWorldHeight(false) / 2;
  clampCamera();
});

// 小地图右键：对选中单位下达移动命令
mmCanvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();

  const selectedUnits = game.selected
    .map(id => entities.find(en => en.id === id))
    .filter(en => en && en.kind === 'unit' && en.team === TEAM_PLAYER);

  if (selectedUnits.length === 0) return;

  const { gx, gy } = minimapEventToPosition(e);
  const command = { type: 'move', targetGrid: { gx, gy } };
  const count = selectedUnits.length;
  const cols = Math.ceil(Math.sqrt(count));

  selectedUnits.forEach((u, i) => {
    if (e.shiftKey) {
      u.actionQueue.push(command);
      if (u.state === 'idle') transitionToIdle(u);
    } else {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const cmd = { type: 'move', targetGrid: clampGrid(gx + col, gy + row) };
      u.actionQueue = [];
      applyCommand(u, cmd);
    }
  });

  addLog(e.shiftKey ? '小地图: 排队移动' : '小地图: 移动命令');
});

// 键盘
window.addEventListener('keydown', (e) => {
  game.keysDown[e.key] = true;

  if (e.key === 'F1') {
    e.preventDefault();
    selectIdleWorkers();
    return;
  }

  if (e.key.toLowerCase() === 't' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
    const hasPlayerUnits = game.selected
      .map(id => entities.find(en => en.id === id))
      .some(isStopCommandTarget);

    if (hasPlayerUnits) {
      e.preventDefault();
      game.keysDown[e.key] = false;
      stopSelectedUnits();
      return;
    }
  }

  if (e.key === 'Escape') {
    if (game.attackMoveMode) {
      setAttackMoveMode(false);
    } else if (game.commandMode) {
      game.commandMode = null;
      updateSidebar();
    } else if (game.buildMode) {
      cancelBuild();
    } else {
      const selectedBuilding = game.selected
        .map(id => entities.find(en => en.id === id))
        .find(en => en && en.kind === 'building' && en.team === TEAM_PLAYER && en.queue && en.queue.length > 0);
      if (selectedBuilding) {
        cancelProduction(selectedBuilding.id, selectedBuilding.queue.length - 1);
      }
    }
    e.preventDefault();
    return;
  }

  if (e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.altKey) {
    const hasSelectedUnit = game.selected
      .map(id => entities.find(en => en.id === id))
      .some(en => en && en.kind === 'unit' && en.team === TEAM_PLAYER);
    if (hasSelectedUnit) {
      e.preventDefault();
      game.keysDown[e.key] = false;
      if (game.buildMode) cancelBuild();
      if (game.commandMode) game.commandMode = null;
      setAttackMoveMode(true, e.shiftKey);
      addLog(e.shiftKey ? '⚔️ 选择攻击移动目标（排队）' : '⚔️ 选择攻击移动目标');
      return;
    }
  }

  if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.altKey && !e.metaKey && game.selected.length > 0) {
    e.preventDefault();
    holdSelectedUnits();
    return;
  }

  if (e.key === ' ') {
    e.preventDefault();
    game.paused = !game.paused;
    if (game.paused) game.speedAccumulator = 0;
    return;
  }

  if (e.key === '+' || e.key === '=' || e.code === 'Equal' || e.code === 'NumpadAdd') {
    e.preventDefault();
    setGameSpeed(game.speed + 0.5);
    return;
  }

  if (e.key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
    e.preventDefault();
    setGameSpeed(game.speed - 0.5);
    return;
  }

  if (e.key === 'Backspace') {
    e.preventDefault();
    setGameSpeed(1);
    return;
  }

  if (e.key.toLowerCase() === 'p' && game.selected.length > 0 && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    startPatrolCommand();
    return;
  }

  // Use e.code for modifier combos since Shift/Alt change e.key (e.g. Shift+3 → '#')
  let numKey = parseInt(e.key);
  if (isNaN(numKey) && e.code && e.code.startsWith('Digit')) {
    numKey = parseInt(e.code.charAt(5));
  }
  const isNum = numKey >= 1 && numKey <= 9;

  // Ctrl+数字: 分配编队
  if (isNum && e.ctrlKey) {
    e.preventDefault();
    assignControlGroup(numKey);
    return;
  }

  // Shift+数字: 追加到编队
  if (isNum && e.shiftKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    appendControlGroup(numKey);
    return;
  }

  // Alt+数字: 独占编队（steal）
  if (isNum && e.altKey && !e.ctrlKey) {
    e.preventDefault();
    stealControlGroup(numKey);
    return;
  }

  // Tab: 子组切换
  if (e.key === 'Tab' && game.selected.length > 0) {
    e.preventDefault();
    cycleSubGroup();
    return;
  }

  // 数字键: 先尝试原有快捷键，无效则召回编队
  if (isNum && !e.ctrlKey && !e.shiftKey && !e.altKey) {
    const sel = game.selected.map(id => entities.find(en => en.id === id)).filter(Boolean);
    const selectedBuildings = getSelectedProductionBuildings();
    const hasBase = selectedBuildings.some(s => s.type === 'base');
    const hasBarracks = selectedBuildings.some(s => s.type === 'barracks');
    const hasFactory = selectedBuildings.some(s => s.type === 'factory');
    const hasWorker = sel.some(s => s.type === 'worker' && s.team === TEAM_PLAYER);
    let handled = false;

    if (numKey === 1) {
      if (hasBase) { trainUnit('worker'); handled = true; }
      else if (hasBarracks) { trainUnit('soldier'); handled = true; }
    }
    if (numKey === 2) {
      if (hasWorker) { startBuild('barracks'); handled = true; }
      else if (hasBarracks) { trainUnit('ranger'); handled = true; }
    }
    if (numKey === 3) {
      if (hasWorker) { startBuild('factory'); handled = true; }
      else if (hasFactory) { trainUnit('tank'); handled = true; }
    }
    if (numKey === 4) {
      if (hasWorker) { startBuild('supply'); handled = true; }
    }
    if (selBuilding && selBuilding.type === 'base') {
      const upgradeKeyMap = { 5: 'attackUp1', 6: 'attackUp2', 7: 'armorUp1', 8: 'speedUp1' };
      const upgradeKey = upgradeKeyMap[numKey];
      if (upgradeKey) {
        researchUpgrade(upgradeKey, selBuilding.id);
        handled = true;
      }
    }
    if (!handled) recallControlGroup(numKey);
    return;
  }

  if (e.key === 'r' && game.gameOver) location.reload();
});

window.addEventListener('keyup', (e) => {
  game.keysDown[e.key] = false;
});
