function formatGameSpeed() {
  return `${Number.isInteger(game.speed) ? game.speed : game.speed.toFixed(1)}x`;
}

function setGameSpeed(speed) {
  const nextSpeed = Math.max(0.5, Math.min(3, Math.round(speed * 2) / 2));
  if (game.speed === nextSpeed) return;
  game.speed = nextSpeed;
  game.speedAccumulator = 0;
  updateHUD();
}

function updateHUD() {
  document.getElementById('hudMinerals').textContent = game.minerals;
  document.getElementById('hudPop').textContent = `${game.pop}/${game.maxPop}`;
  document.getElementById('hudUnits').textContent = entities.filter(e => e.team === TEAM_PLAYER && e.hp > 0 && e.kind === 'unit').length;
  document.getElementById('hudEnemies').textContent = entities.filter(e => e.team === TEAM_ENEMY && e.hp > 0).length;
  document.getElementById('hudTime').textContent = formatTime(game.frame);
  document.getElementById('hudSpeed').textContent = formatGameSpeed();
  const idleWorkers = entities.filter(e =>
    e.team === TEAM_PLAYER &&
    e.hp > 0 &&
    e.kind === 'unit' &&
    e.type === 'worker' &&
    e.state === 'idle'
  );
  const idleEl = document.getElementById('hudIdleWorkers');
  const idleCount = document.getElementById('hudIdleCount');
  if (idleWorkers.length > 0) {
    idleEl.style.display = 'inline';
    idleCount.textContent = idleWorkers.length;
    idleCount.style.color = game.frame % 60 < 30 ? '#f80' : '#ff0';
  } else {
    idleEl.style.display = 'none';
  }
}

function updateGuide() {
  const guideEl = document.getElementById('guide');
  const row = (k, v) => `<div class="guide-row"><span class="guide-key">${k}</span><span class="guide-desc">${v}</span></div>`;
  let html = '';

  if (game.attackMoveMode) {
    html += '<div class="guide-section">';
    html += row('左键', game.attackMoveQueued ? '排队攻击移动' : '攻击移动');
    html += row('右键/Esc', '取消攻击移动');
    html += '</div>';
    guideEl.innerHTML = html;
    return;
  }

  if (game.buildMode) {
    html += '<div class="guide-section">';
    html += row('左键', '放置建筑');
    html += row('右键/Esc', '取消建造');
    html += row('F1', '选中空闲工人');
    html += '</div>';
    guideEl.innerHTML = html;
    return;
  }

  if (game.commandMode === 'patrol') {
    html += '<div class="guide-section">';
    html += row('左键', '设置巡逻点');
    html += row('Shift+左键', '排队巡逻');
    html += row('右键/Esc', '取消巡逻');
    html += '</div>';
    guideEl.innerHTML = html;
    return;
  }

  const sel = game.selected.map(id => entities.find(e => e.id === id)).filter(Boolean);

  if (sel.length === 0) {
    html += '<div class="guide-section">';
    html += row('左键', '选中单位/建筑');
    html += row('左键拖拽', '框选多个单位');
    html += row('双击单位', '选择屏幕内同类型');
    html += row('Ctrl+点击', '选择屏幕内同类型');
    html += row('Ctrl+数字', '设置编队');
    html += row('Shift+数字', '追加编队');
    html += row('Alt+数字', '独占编队');
    html += row('数字键', '召回编队');
    html += row('F1', '选中空闲工人');
    html += row('Tab', '子组切换');
    html += row('滚轮', '缩放视角');
    html += row('WASD', '滚动地图');
    html += row('目标', '摧毁左上敌方基地');
    html += '</div>';
    guideEl.innerHTML = html;
    return;
  }

  const first = sel[0];
  html += '<div class="guide-section">';

  if (first.kind === 'building') {
    html += row('左键空地', '取消选中');
    html += row('F1', '选中空闲工人');
  } else if (first.kind === 'unit') {
    const hasWorker = sel.some(e => e.type === 'worker');
    html += row('右键空地', '移动');
    html += row('右键敌人', '攻击');
    html += row('A', '攻击移动');
    html += row('Shift+A', '排队攻击移动');
    html += row('H', '驻守');
    if (hasWorker) html += row('右键矿石', '采矿');
    html += row('T', '停止');
    html += row('Ctrl+数字', '设置编队');
    html += row('Shift+数字', '追加编队');
    html += row('Alt+数字', '独占编队');
    html += row('F1', '选中空闲工人');
    html += row('Tab', '子组切换');
    html += row('左键空地', '取消选中');
  }

  html += row('WASD', '滚动地图');
  html += row('滚轮', '缩放视角');
  html += '</div>';
  guideEl.innerHTML = html;
}

function updateGroupBar() {
  const bar = document.getElementById('groupBar');
  let html = '';
  for (let i = 1; i <= 9; i++) {
    const ids = game.controlGroups[i];
    const alive = ids ? ids.filter(id => entities.find(e => e.id === id && e.hp > 0)) : [];
    if (ids) game.controlGroups[i] = alive;
    const hasUnits = alive.length > 0;
    const isSelected = hasUnits && alive.length === game.selected.length && alive.every(id => game.selected.includes(id));
    const cls = isSelected ? 'grp-btn selected' : (hasUnits ? 'grp-btn active' : 'grp-btn');
    const tip = hasUnits
      ? `${alive.length}个单位 | 右键:设置 Shift+右键:追加 Alt+右键:独占`
      : '右键:设置编队';
    const countTag = hasUnits ? `<span class="grp-count">${alive.length}</span>` : '';
    html += `<button class="${cls}" onclick="recallControlGroup(${i})" oncontextmenu="handleGroupBarRightClick(event,${i})" title="${tip}">${i}${countTag}</button>`;
  }
  bar.innerHTML = html;
}

function handleGroupBarRightClick(e, num) {
  e.preventDefault();
  e.stopPropagation();
  if (e.altKey) {
    stealControlGroup(num);
  } else if (e.shiftKey) {
    appendControlGroup(num);
  } else {
    assignControlGroup(num);
  }
}

function isStopCommandTarget(entity) {
  return entity && entity.kind === 'unit' && entity.team === TEAM_PLAYER;
}

function updateSidebar() {
  updateGuide();
  updateGroupBar();
  const infoEl = document.getElementById('info');
  const actionsEl = document.getElementById('actions');

  if (game.buildMode) {
    const bDef = BUILDING_DEFS[game.buildMode];
    infoEl.innerHTML = `<span style="color:#ff0">建造模式: ${bDef.desc}</span><br>左键放置 | 右键/Esc取消`;
    actionsEl.innerHTML = `<button class="btn" onclick="cancelBuild()">取消建造 [Esc]</button>`;
    return;
  }

  if (game.selected.length === 0) {
    infoEl.innerHTML = '未选中任何单位';
    actionsEl.innerHTML = '';
    return;
  }

  const selectedEntities = game.selected.map(id => entities.find(e => e.id === id)).filter(Boolean);
  if (selectedEntities.length === 0) {
    game.selected = [];
    infoEl.innerHTML = '未选中任何单位';
    actionsEl.innerHTML = '';
    return;
  }

  const first = selectedEntities[0];

  if (first.kind === 'building') {
    const selectedBuildings = selectedEntities.filter(e => e.kind === 'building');
    const allSelectedAreBuildings = selectedBuildings.length === selectedEntities.length;
    if (allSelectedAreBuildings && selectedBuildings.length > 1) {
      const counts = {};
      let totalQueue = 0;
      for (const b of selectedBuildings) {
        counts[b.type] = (counts[b.type] || 0) + 1;
        totalQueue += b.queue.length;
      }

      let html = '';
      for (const [type, count] of Object.entries(counts)) {
        const bDef = BUILDING_DEFS[type];
        html += `<span style="color:${bDef.color}">${bDef.char} ${bDef.desc} x${count}</span><br>`;
      }
      html += `总队列: ${totalQueue}个`;
      infoEl.innerHTML = html;

      let btns = '';
      const productionBuildings = getSelectedProductionBuildings();
      const hasBase = productionBuildings.some(b => b.type === 'base');
      const hasBarracks = productionBuildings.some(b => b.type === 'barracks');
      const hasFactory = productionBuildings.some(b => b.type === 'factory');
      const producibleTypes = new Set();
      for (const b of productionBuildings) {
        const bDef = BUILDING_DEFS[b.type];
        if (!bDef.produces) continue;
        for (const uType of bDef.produces) producibleTypes.add(uType);
      }
      const keyForUnit = (uType) => {
        if (uType === 'worker' && hasBase) return '1';
        if (uType === 'soldier' && !hasBase && hasBarracks) return '1';
        if (uType === 'ranger' && hasBarracks) return '2';
        if (uType === 'tank' && hasFactory) return '3';
        return '';
      };
      for (const uType of producibleTypes) {
        const uDef = UNIT_DEFS[uType];
        const key = keyForUnit(uType);
        const keyLabel = key ? `<span class="btn-key">[${key}]</span> ` : '';
        btns += `<button class="btn" onclick="trainUnit('${uType}')">
          ${keyLabel}${uDef.char} ${uDef.desc} <span class="cost">${uDef.cost}矿</span>
        </button>`;
      }
      actionsEl.innerHTML = btns;
      return;
    }

    const bDef = BUILDING_DEFS[first.type];
    let html = `<span style="color:${bDef.color}">${bDef.char} ${bDef.desc}</span><br>`;
    html += `HP: ${first.hp}/${first.maxHp}<br>`;
    if (first.buildProgress < first.maxHp) {
      html += `建造中: ${Math.floor(first.buildProgress / first.maxHp * 100)}%`;
    }
    if (first.queue.length > 0) {
      html += `<br>生产队列:`;
      for (let i = 0; i < first.queue.length; i++) {
        const uType = first.queue[i];
        const uDef = UNIT_DEFS[uType];
        const isFirst = i === 0;
        const pct = isFirst ? Math.floor(first.queueTimer / uDef.buildTime * 100) : 0;
        const label = isFirst ? `${uDef.char} ${pct}%` : uDef.char;
        html += ` <button class="btn" style="display:inline;width:auto;padding:2px 6px;margin:2px 2px 0 0;" onclick="cancelProduction(${first.id}, ${i})">${label} ✕</button>`;
      }
    }
    if (first.researchQueue && first.researchQueue.length > 0) {
      const upgradeKey = first.researchQueue[0];
      const upgrade = UPGRADES[upgradeKey];
      const pct = Math.floor(first.researchTimer / upgrade.time * 100);
      html += `<br>研究中: ${upgrade.name} (${pct}%)`;
    }    if (first.team === TEAM_PLAYER && bDef.produces) {
      if (first.rallyPoint) {
        const rp = first.rallyPoint;
        const tag = rp.type === 'mineral' ? '矿区 ⛏️' : '已设置 🚩';
        html += `<br>集结点: ${tag} (${rp.gx},${rp.gy})`;
      } else {
        html += `<br>集结点: 无（右键设置）`;
      }
    }
    infoEl.innerHTML = html;

    let btns = '';
    if (first.buildProgress >= first.maxHp && first.team === TEAM_PLAYER && bDef.produces) {
      const keyMap = { worker: '1', soldier: '1', ranger: '2', tank: '3' };
      for (const uType of bDef.produces) {
        const uDef = UNIT_DEFS[uType];
        const key = keyMap[uType] || '';
        btns += `<button class="btn" onclick="trainUnit('${uType}', ${first.id})">
          <span class="btn-key">[${key}]</span> ${uDef.char} ${uDef.desc} <span class="cost">${uDef.cost}矿</span>
        </button>`;
      }
    }
    if (first.buildProgress >= first.maxHp && first.team === TEAM_PLAYER && first.type === 'base') {
      const researchKeyMap = { attackUp1: '5', attackUp2: '6', armorUp1: '7', speedUp1: '8' };
      btns += '<div style="margin-top:8px;color:#0a0;border-top:1px solid #030;padding-top:6px">科技研究</div>';
      for (const key of UPGRADE_KEYS) {
        const upgrade = UPGRADES[key];
        const status = getUpgradeStatus(key, first);
        const hotkey = researchKeyMap[key] || '';
        const progress = first.researchQueue?.[0] === key
          ? ` ${Math.floor(first.researchTimer / upgrade.time * 100)}%`
          : '';
        btns += `<button class="btn" onclick="researchUpgrade('${key}', ${first.id})" ${status.available ? '' : 'disabled'} title="${status.reason}">
          <span class="btn-key">[${hotkey}]</span> ${upgrade.name}${progress} <span class="cost">${upgrade.cost}矿</span>
        </button>`;
      }
    }    actionsEl.innerHTML = btns;
  } else {
    if (selectedEntities.length === 1) {
      const uDef = UNIT_DEFS[first.type];
      let html = `<span style="color:${uDef.color}">${uDef.char} ${uDef.desc}</span><br>`;
      html += `HP: ${first.hp}/${first.maxHp}<br>`;
      html += `攻击: ${uDef.atk} | 射程: ${uDef.range}<br>`;
      html += `状态: ${first.state}`;
      if (first.carrying > 0) html += `<br>携带矿石: ${first.carrying}`;
      infoEl.innerHTML = html;
    } else {
      const counts = {};
      for (const e of selectedEntities) {
        counts[e.type] = (counts[e.type] || 0) + 1;
      }
      let html = `选中 ${selectedEntities.length} 个单位:<br>`;
      for (const [type, count] of Object.entries(counts)) {
        html += `${UNIT_DEFS[type].char} x${count} `;
      }
      html += '<div class="selection-grid">';
      for (const e of selectedEntities) {
        const uDef = UNIT_DEFS[e.type];
        const hpPct = Math.max(0, Math.min(100, Math.floor(e.hp / e.maxHp * 100)));
        const hpColor = hpPct > 50 ? '#0f0' : hpPct > 25 ? '#ff0' : '#f00';
        html += `<button class="selection-icon" onclick="selectUnitIcon(event, ${e.id})" oncontextmenu="deselectUnitIcon(event, ${e.id})" title="${uDef.desc} HP:${e.hp}/${e.maxHp}">
          <span style="color:${uDef.color}">${uDef.char}</span>
          <span class="hp-track"><span class="hp-fill" style="width:${hpPct}%;background:${hpColor}"></span></span>
        </button>`;
      }
      html += '</div>';
      infoEl.innerHTML = html;
    }

    let btns = '';
    if (selectedEntities.some(isStopCommandTarget)) {
      btns += `<button class="btn" onclick="stopSelectedUnits()"><span class="btn-key">[T]</span> 停止</button>`;
    }
    if (selectedEntities.some(e => e.kind === 'unit' && e.team === TEAM_PLAYER)) {
      btns += `<button class="btn" onclick="holdSelectedUnits()"><span class="btn-key">[H]</span> 驻守</button>`;
    }
    btns += '<button class="btn" onclick="startPatrolCommand()"><span class="btn-key">[P]</span> 巡逻</button>';
    const hasWorker = selectedEntities.some(e => e.type === 'worker');
    if (hasWorker) {
      const buildKeyMap = { barracks: '2', factory: '3', tower: '', supply: '4' };
      for (const [bType, bDef] of Object.entries(BUILDING_DEFS)) {
        if (bType === 'base') continue;
        const key = buildKeyMap[bType] || '';
        btns += `<button class="btn" onclick="startBuild('${bType}')" ${game.minerals < bDef.cost ? 'disabled' : ''}>
          ${key ? `<span class="btn-key">[${key}]</span> ` : ''}${bDef.char} ${bDef.desc} <span class="cost">${bDef.cost}矿</span>
        </button>`;
      }
    }
    actionsEl.innerHTML = btns;
  }
}

function selectUnitIcon(event, id) {
  event.preventDefault();
  event.stopPropagation();
  if (event.shiftKey) {
    deselectUnit(id);
    return;
  }
  focusUnit(id);
}

function deselectUnitIcon(event, id) {
  event.preventDefault();
  event.stopPropagation();
  deselectUnit(id);
}

function focusUnit(id) {
  const unit = entities.find(e => e.id === id && e.hp > 0);
  if (!unit) return;
  game.selected = [id];
  game._subGroupType = null;
  game._fullSelection = null;
  camera.x = unit.x - canvas.width / 2;
  camera.y = unit.y - canvas.height / 2;
  clampCamera();
  updateSidebar();
}

function deselectUnit(id) {
  game.selected = game.selected.filter(sid => sid !== id);
  if (game.selected.length === 0) {
    game._subGroupType = null;
    game._fullSelection = null;
  }
  updateSidebar();
}

// ---- 操作命令 ----
// ---- 编队系统 ----
function assignControlGroup(num) {
  if (game.selected.length === 0) return;
  game.controlGroups[num] = [...game.selected];
  addLog(`编队 ${num}: ${game.selected.length} 个单位`);
  updateSidebar();
  flashGroupButton(num);
}

function appendControlGroup(num) {
  if (game.selected.length === 0) return;
  if (!game.controlGroups[num]) game.controlGroups[num] = [];
  for (const id of game.selected) {
    if (!game.controlGroups[num].includes(id)) {
      game.controlGroups[num].push(id);
    }
  }
  addLog(`追加编队 ${num}: +${game.selected.length}`);
  updateSidebar();
  flashGroupButton(num);
}

function stealControlGroup(num) {
  if (game.selected.length === 0) return;
  // Remove selected units from all other groups
  for (let i = 1; i <= 9; i++) {
    if (i === num || !game.controlGroups[i]) continue;
    game.controlGroups[i] = game.controlGroups[i].filter(id => !game.selected.includes(id));
  }
  game.controlGroups[num] = [...game.selected];
  addLog(`独占编队 ${num}: ${game.selected.length} 个单位`);
  updateSidebar();
  flashGroupButton(num);
}

function flashGroupButton(num) {
  const btn = document.querySelector(`#groupBar button:nth-child(${num})`);
  if (btn) {
    btn.classList.remove('flash');
    void btn.offsetWidth;
    btn.classList.add('flash');
  }
}

function recallControlGroup(num) {
  const ids = game.controlGroups[num];
  if (!ids || ids.length === 0) return false;
  const alive = ids.filter(id => entities.find(e => e.id === id && e.hp > 0));
  game.controlGroups[num] = alive;
  if (alive.length === 0) return false;
  game.selected = [...alive];
  const units = alive.map(id => entities.find(e => e.id === id)).filter(Boolean);
  const cx = units.reduce((s, u) => s + u.x, 0) / units.length;
  const cy = units.reduce((s, u) => s + u.y, 0) / units.length;
  camera.x = cx - getViewportWorldWidth() / 2;
  camera.y = cy - getViewportWorldHeight(false) / 2;
  clampCamera();
  updateSidebar();
  return true;
}

function selectIdleWorkers() {
  const idleWorkers = entities.filter(e =>
    e.team === TEAM_PLAYER &&
    e.hp > 0 &&
    e.kind === 'unit' &&
    e.type === 'worker' &&
    e.state === 'idle'
  );

  if (idleWorkers.length === 0) {
    addLog('没有空闲工人');
    return false;
  }

  game.selected = idleWorkers.map(w => w.id);
  game._subGroupType = null;
  game._fullSelection = null;
  const cx = idleWorkers.reduce((s, w) => s + w.x, 0) / idleWorkers.length;
  const cy = idleWorkers.reduce((s, w) => s + w.y, 0) / idleWorkers.length;
  camera.x = cx - canvas.width / 2;
  camera.y = cy - canvas.height / 2;
  clampCamera();
  addLog(`选中 ${idleWorkers.length} 个空闲工人`);
  updateSidebar();
  return true;
}

// ---- 子组切换 (Tab) ----
function cycleSubGroup() {
  // Use stored full selection if available (after first Tab), otherwise current selection
  const sourceIds = game._fullSelection || game.selected;
  const selEntities = sourceIds
    .map(id => entities.find(e => e.id === id))
    .filter(e => e && e.hp > 0);
  if (selEntities.length === 0) return;

  // Group by type
  const types = [...new Set(selEntities.map(e => e.type))];
  if (types.length <= 1) return; // only one type, nothing to cycle

  // Store the full selection on first Tab press
  if (!game._fullSelection) game._fullSelection = [...game.selected];

  // Find current sub-group type and advance
  const currentType = game._subGroupType || null;
  let nextIdx = 0;
  if (currentType) {
    const curIdx = types.indexOf(currentType);
    nextIdx = (curIdx + 1) % types.length;
  }
  game._subGroupType = types[nextIdx];

  // Select only units of this type from the full selection
  const subIds = selEntities.filter(e => e.type === game._subGroupType).map(e => e.id);
  game.selected = subIds;
  addLog(`子组: ${UNIT_DEFS[game._subGroupType]?.desc || game._subGroupType}`);
  updateSidebar();
}
