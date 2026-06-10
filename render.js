function render() {
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.scale(camera.zoom, camera.zoom);

  const startGX = Math.floor(camera.x / CELL);
  const startGY = Math.floor(camera.y / CELL);
  const endGX = Math.min(MAP_W, startGX + Math.ceil(getViewportWorldWidth() / CELL) + 1);
  const endGY = Math.min(MAP_H, startGY + Math.ceil(getViewportWorldHeight() / CELL) + 1);

  // 绘制网格和地形（分层渲染）
  ctx.font = `${CELL - 4}px Courier New`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let gy = startGY; gy < endGY; gy++) {
    for (let gx = startGX; gx < endGX; gx++) {
      const sx = gx * CELL - camera.x;
      const sy = gy * CELL - camera.y;

      // 地形底色
      const terrainType = mapLayers.terrain[gy]?.[gx] ?? 0;
      const tp = TERRAIN_PROPS[terrainType];
      if (tp.color !== '#0a1a0a') {
        ctx.fillStyle = tp.color;
        ctx.fillRect(sx, sy, CELL, CELL);
      }
      if (tp.char) {
        ctx.fillStyle = tp.charColor;
        ctx.fillText(tp.char, sx + CELL / 2, sy + CELL / 2);
      }

      ctx.strokeStyle = '#1a1a1a';
      ctx.strokeRect(sx, sy, CELL, CELL);

      // 资源层
      if (mapLayers.resource[gy]?.[gx] === 1) {
        ctx.fillStyle = '#44f';
        ctx.fillText('矿', sx + CELL / 2, sy + CELL / 2);
      }
      // 障碍层
      if (mapLayers.obstacle[gy]?.[gx] === 1) {
        ctx.fillStyle = '#555';
        ctx.fillText('岩', sx + CELL / 2, sy + CELL / 2);
      }
    }
  }

  // 战争迷雾遮罩 (绘制在地形之上, 实体之下)
  // - UNEXPLORED: 不透明黑色, 完全遮挡地形
  // - EXPLORED: 半透明黑色, 地形可见但暗淡
  if (window.fogEnabled) {
    for (let gy = startGY; gy < endGY; gy++) {
      for (let gx = startGX; gx < endGX; gx++) {
        const fog = fogMap[gy]?.[gx];
        if (fog === FOG_VISIBLE) continue;
        const fsx = gx * CELL - camera.x;
        const fsy = gy * CELL - camera.y;
        if (fog === FOG_UNEXPLORED) {
          ctx.fillStyle = '#000';
        } else { // FOG_EXPLORED
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
        }
        ctx.fillRect(fsx, fsy, CELL, CELL);
      }
    }
  }

  // 绘制实体
  for (const e of entities) {
    if (e.hp <= 0) continue;
    const sx = e.x - camera.x;
    const sy = e.y - camera.y;

    if (sx < -CELL * 3 || sx > getViewportWorldWidth() + CELL * 3 || sy < -CELL * 3 || sy > getViewportWorldHeight() + CELL * 3) continue;

    // 战争迷雾: 敌方实体仅在视野格内才渲染
    if (!isEnemyVisibleToPlayer(e)) continue;

    if (e.kind === 'building') {
      const bDef = BUILDING_DEFS[e.type];
      const bx = e.gx * CELL - camera.x;
      const by = e.gy * CELL - camera.y;
      const bw = bDef.w * CELL;
      const bh = bDef.h * CELL;

      const alpha = e.buildProgress >= e.maxHp ? 0.3 : 0.15;
      ctx.fillStyle = e.team === TEAM_PLAYER ? `rgba(0,255,0,${alpha})` : `rgba(255,0,0,${alpha})`;
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = e.team === TEAM_PLAYER ? '#0a0' : '#a00';
      ctx.strokeRect(bx, by, bw, bh);

      const bColor = isHitFlashActive(e) ? '#f00' : (e.team === TEAM_PLAYER ? bDef.color : '#f44');
      ctx.fillStyle = bColor;
      ctx.font = `bold ${CELL}px Courier New`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = e.buildProgress < e.maxHp
        ? `${bDef.char}${Math.floor(e.buildProgress / e.maxHp * 100)}%`
        : bDef.char;
      ctx.fillText(label, bx + bw / 2, by + bh / 2);

      if (e.queue.length > 0) {
        const producing = e.queue[0];
        const uDef = UNIT_DEFS[producing];
        const pct = e.queueTimer / uDef.buildTime;
        ctx.fillStyle = '#030';
        ctx.fillRect(bx, by + bh + 2, bw, 4);
        ctx.fillStyle = '#0f0';
        ctx.fillRect(bx, by + bh + 2, bw * pct, 4);
      }

      drawHpBar(bx, by - 6, bw, e.hp, e.maxHp, game.selected.includes(e.id));
    } else {
      const uDef = UNIT_DEFS[e.type];
      // 丧尸系单位保留自身的暗色，便于与普通敌军区分
      const isZombieType = e.type === 'zombie' || e.type === 'berserker' || e.type === 'bloater';
      const uColor = isHitFlashActive(e) ? '#f00' : (e.team === TEAM_PLAYER ? uDef.color : (isZombieType ? uDef.color : '#f44'));
      const isSelected = game.selected.includes(e.id);

      if (isSelected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, CELL / 2 + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      }

      // 编队编号
      if (e.team === TEAM_PLAYER) {
        for (const [gNum, ids] of Object.entries(game.controlGroups)) {
          if (ids.includes(e.id)) {
            ctx.fillStyle = '#ff0';
            ctx.font = 'bold 10px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(gNum, sx, sy - CELL / 2 - 1);
            break;
          }
        }
      }

      ctx.fillStyle = uColor;
      ctx.font = `bold ${CELL - 2}px Courier New`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(uDef.char, sx, sy);

      if (e.carrying > 0) {
        ctx.fillStyle = '#44f';
        ctx.font = '10px Courier New';
        ctx.fillText('◆', sx + 10, sy - 10);
      }

      if (e.state === 'gather') {
        ctx.fillStyle = '#0af';
        ctx.font = '9px Courier New';
        ctx.fillText('⛏', sx + 10, sy + 10);
      } else if (e.state === 'attack') {
        ctx.fillStyle = '#f00';
        ctx.font = '9px Courier New';
        ctx.fillText('⚔', sx + 10, sy + 10);
      } else if (e.state === 'hold') {
        ctx.fillStyle = '#0ff';
        ctx.font = '9px Courier New';
        ctx.fillText('🛡', sx + 10, sy + 10);
      } else if (e.state === 'build') {
        ctx.fillStyle = '#ff0';
        ctx.font = '9px Courier New';
        ctx.fillText('🔨', sx + 10, sy + 10);
      }

      if (e.state === 'patrol') {
        ctx.fillStyle = '#00e5ff';
        ctx.font = '9px Courier New';
        ctx.fillText('P', sx + 10, sy + 10);
      }

      drawHpBar(sx - CELL / 2, sy - CELL / 2 - 4, CELL, e.hp, e.maxHp, isSelected);

      if (isSelected && e.actionQueue && e.actionQueue.length > 0) {
        ctx.fillStyle = '#ff0';
        ctx.font = 'bold 9px Courier New';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`[${e.actionQueue.length}]`, sx + CELL / 2 + 2, sy - CELL / 2 + 3);
      }
    }
  }

  // 选中建筑高亮 + 集结点标记
  for (const id of game.selected) {
    const e = entities.find(en => en.id === id);
    if (!e || e.kind !== 'building' || e.team !== TEAM_PLAYER) continue;
    const bDef = BUILDING_DEFS[e.type];
    const bx = e.gx * CELL - camera.x;
    const by = e.gy * CELL - camera.y;
    const bw = bDef.w * CELL;
    const bh = bDef.h * CELL;

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx - 2, by - 2, bw + 4, bh + 4);
    ctx.lineWidth = 1;

    if (e.rallyPoint) {
      const rp = e.rallyPoint;
      const cx = bx + bw / 2;
      const cy = by + bh / 2;
      const rx = rp.gx * CELL + CELL / 2 - camera.x;
      const ry = rp.gy * CELL + CELL / 2 - camera.y;
      const isMineral = rp.type === 'mineral';
      const color = isMineral ? '#0af' : '#ff0';

      ctx.strokeStyle = color;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(rx, ry);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(rx, ry, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#000';
      ctx.font = `bold 12px Courier New`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isMineral ? '⛏' : '⚑', rx, ry + 1);
    }
  }

  // 排队路径线渲染：每个选中单位按自己的当前任务和队列绘制路径线
  {
    const selectedWithQueue = game.selected
      .map(id => entities.find(en => en.id === id))
      .filter(u => u && u.kind === 'unit' && (u.actionQueue.length > 0 || ((u.state === 'move' || u.state === 'attackMove') && u.target) || (u.state === 'attack' && u.attackTarget) || (u.state === 'gather' && u.gatherTarget) || (u.state === 'build' && u.buildTarget)));

    if (selectedWithQueue.length > 0) {
      const commandColors = {
        move: '#ff0',
        attackMove: '#f44',
        attack: '#f44',
        gather: '#4af',
        build: '#4f4',
        patrol: '#c6f',
      };
      const colorForCommand = (type) => commandColors[type] || commandColors.move;

      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;

      const getUnitWaypoints = (unit) => {
        const waypoints = [];

        if ((unit.state === 'move' || unit.state === 'attackMove') && unit.target) {
          const type = unit.state === 'attackMove' ? 'attackMove' : 'move';
          waypoints.push({ x: unit.target.x - camera.x, y: unit.target.y - camera.y, color: colorForCommand(type) });
        } else if (unit.state === 'attack' && unit.attackTarget) {
          const at = entities.find(t => t.id === unit.attackTarget);
          if (at) waypoints.push({ x: at.x - camera.x, y: at.y - camera.y, color: colorForCommand('attack') });
        } else if (unit.state === 'gather' && unit.gatherTarget) {
          waypoints.push({
            x: unit.gatherTarget.gx * CELL + CELL / 2 - camera.x,
            y: unit.gatherTarget.gy * CELL + CELL / 2 - camera.y,
            color: colorForCommand('gather'),
          });
        } else if (unit.state === 'build' && unit.buildTarget) {
          const bt = entities.find(b => b.id === unit.buildTarget);
          if (bt) waypoints.push({ x: bt.x - camera.x, y: bt.y - camera.y, color: colorForCommand('build') });
        }

        for (const cmd of unit.actionQueue) {
          let nx, ny;
          const color = colorForCommand(cmd.type);
          if (cmd.type === 'move' || cmd.type === 'attackMove' || cmd.type === 'patrol') {
            nx = cmd.targetGrid.gx * CELL + CELL / 2 - camera.x;
            ny = cmd.targetGrid.gy * CELL + CELL / 2 - camera.y;
          } else if (cmd.type === 'attack') {
            const at = entities.find(t => t.id === cmd.targetId);
            if (!at) continue;
            nx = at.x - camera.x; ny = at.y - camera.y;
          } else if (cmd.type === 'gather') {
            nx = cmd.gatherTarget.gx * CELL + CELL / 2 - camera.x;
            ny = cmd.gatherTarget.gy * CELL + CELL / 2 - camera.y;
          } else if (cmd.type === 'build') {
            const bt = entities.find(b => b.id === cmd.buildTargetId);
            if (!bt) continue;
            nx = bt.x - camera.x; ny = bt.y - camera.y;
          } else { continue; }
          waypoints.push({ x: nx, y: ny, color });
        }

        return waypoints;
      };

      const waypointMarkers = new Map();

      for (const unit of selectedWithQueue) {
        let prevX = unit.x - camera.x;
        let prevY = unit.y - camera.y;
        const waypoints = getUnitWaypoints(unit);

        for (const wp of waypoints) {
          ctx.strokeStyle = wp.color;
          ctx.beginPath();
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(wp.x, wp.y);
          ctx.stroke();
          prevX = wp.x;
          prevY = wp.y;
          waypointMarkers.set(`${wp.x},${wp.y},${wp.color}`, wp);
        }
      }

      for (const wp of waypointMarkers.values()) {
        ctx.fillStyle = wp.color;
        ctx.beginPath();
        ctx.arc(wp.x, wp.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.setLineDash([]);
    }
  }

  // Patrol route preview for selected units.
  {
    const patrolUnits = game.selected
      .map(id => entities.find(en => en.id === id))
      .filter(u => u && u.kind === 'unit' && (u.state === 'patrol' || u._patrolState));

    if (patrolUnits.length > 0) {
      ctx.strokeStyle = '#00e5ff';
      ctx.fillStyle = '#00e5ff';
      ctx.setLineDash([8, 5]);
      ctx.lineWidth = 2;

      for (const unit of patrolUnits) {
        const state = unit._patrolState || {
          pointA: unit.patrolPointA,
          pointB: unit.patrolPointB,
        };
        const a = state.pointA;
        const b = state.pointB;
        if (!a || !b) continue;

        const ax = a.x - camera.x;
        const ay = a.y - camera.y;
        const bx = b.x - camera.x;
        const by = b.y - camera.y;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();

        drawPatrolArrow(ax, ay, bx, by);
        drawPatrolArrow(bx, by, ax, ay);
      }

      ctx.setLineDash([]);
      ctx.lineWidth = 1;
    }
  }

  // 框选框
  if (game.dragStart && game.dragEnd) {
    ctx.strokeStyle = '#0f0';
    ctx.lineWidth = 1 / camera.zoom;
    ctx.setLineDash([4 / camera.zoom, 4 / camera.zoom]);
    const rx = Math.min(game.dragStart.x, game.dragEnd.x);
    const ry = Math.min(game.dragStart.y, game.dragEnd.y);
    const rw = Math.abs(game.dragEnd.x - game.dragStart.x);
    const rh = Math.abs(game.dragEnd.y - game.dragStart.y);
    ctx.strokeRect(rx / camera.zoom, ry / camera.zoom, rw / camera.zoom, rh / camera.zoom);
    ctx.setLineDash([]);
  }

  // 建造预览
  if (game.buildMode && game.buildPreview) {
    const bDef = BUILDING_DEFS[game.buildMode];
    const bx = game.buildPreview.gx * CELL - camera.x;
    const by = game.buildPreview.gy * CELL - camera.y;
    const bw = bDef.w * CELL;
    const bh = bDef.h * CELL;
    const canBuild = canPlaceBuilding(game.buildMode, game.buildPreview.gx, game.buildPreview.gy);
    ctx.fillStyle = canBuild ? 'rgba(0,255,0,0.2)' : 'rgba(255,0,0,0.2)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = canBuild ? '#0f0' : '#f00';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(bx, by, bw, bh);
    ctx.setLineDash([]);
    ctx.fillStyle = canBuild ? '#0f0' : '#f00';
    ctx.font = `bold ${CELL}px Courier New`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bDef.char, bx + bw / 2, by + bh / 2);
  }

  // 游戏结束覆盖层
  ctx.restore();

  if (game.gameOver) {
    const isDefeat = entities.filter(e => e.team === TEAM_PLAYER && e.kind === 'building' && e.type === 'base' && e.hp > 0).length === 0;
    const panelW = Math.min(460, canvas.width - 48);
    const panelH = 340;
    const panelX = (canvas.width - panelW) / 2;
    const panelY = Math.max(36, (canvas.height - panelH) / 2);
    const stats = [
      `游戏时长: ${formatTime(game.frame)}`,
      `矿石采集: ${game.stats.mineralsGathered}`,
      `单位生产: ${game.stats.unitsProduced}`,
      `敌方击杀: ${game.stats.unitsKilled}`,
      `己方损失: ${game.stats.unitsLost}`,
      `建筑建造: ${game.stats.buildingsBuilt}`,
      `摧毁敌建: ${game.stats.buildingsDestroyed}`,
    ];

    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(12,18,14,0.92)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = isDefeat ? '#f44' : '#0f0';
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    ctx.fillStyle = isDefeat ? '#f44' : '#0f0';
    ctx.font = 'bold 36px Courier New';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isDefeat ? '战败' : '胜利！', canvas.width / 2, panelY + 52);

    ctx.fillStyle = '#d7ffd7';
    ctx.font = '18px Courier New';
    ctx.textAlign = 'left';
    stats.forEach((s, i) => ctx.fillText(s, panelX + 64, panelY + 110 + i * 28));

    ctx.fillStyle = '#9f9';
    ctx.font = '18px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('按 R 重新开始', canvas.width / 2, panelY + panelH - 34);
  }

  renderMinimap();
}

function isHitFlashActive(e) {
  return e.lastHitFrame && game.frame - e.lastHitFrame < 10 && game.frame % 4 < 2;
}

function drawHpBar(x, y, w, hp, maxHp, isSelected = false) {
  if (hp >= maxHp && !isSelected) return;
  const pct = hp / maxHp;
  const h = isSelected ? 10 : 3;
  ctx.fillStyle = '#300';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = pct > 0.5 ? '#0f0' : pct > 0.25 ? '#ff0' : '#f00';
  ctx.fillRect(x, y, w * pct, h);
  if (isSelected) {
    ctx.fillStyle = pct > 0.25 ? '#000' : '#fff';
    ctx.font = 'bold 8px Courier New';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.max(0, hp)}/${maxHp}`, x + w / 2, y + h / 2);
  }
}

function drawPatrolArrow(fromX, fromY, toX, toY) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const size = 8;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - Math.cos(angle - Math.PI / 6) * size, toY - Math.sin(angle - Math.PI / 6) * size);
  ctx.lineTo(toX - Math.cos(angle + Math.PI / 6) * size, toY - Math.sin(angle + Math.PI / 6) * size);
  ctx.closePath();
  ctx.fill();
}

function renderMinimap() {
  const mw = mmCanvas.width;
  const mh = mmCanvas.height;
  const sx = mw / MAP_W;
  const sy = mh / MAP_H;

  // 背景填黑 (未探索区域默认状态)
  mmCtx.fillStyle = '#000';
  mmCtx.fillRect(0, 0, mw, mh);

  // 地形 (只在 EXPLORED / VISIBLE 区域绘制)
  for (let gy = 0; gy < MAP_H; gy++) {
    for (let gx = 0; gx < MAP_W; gx++) {
      const fog = window.fogEnabled ? fogMap[gy][gx] : FOG_VISIBLE;
      if (fog === FOG_UNEXPLORED) continue;
      // 地形层
      const terrainType = mapLayers.terrain[gy][gx];
      if (terrainType !== TERRAIN_GRASS) {
        mmCtx.fillStyle = TERRAIN_PROPS[terrainType].color;
        mmCtx.fillRect(gx * sx, gy * sy, sx, sy);
      }
      // 资源层
      if (mapLayers.resource[gy][gx] === 1) {
        mmCtx.fillStyle = '#00a';
        mmCtx.fillRect(gx * sx, gy * sy, sx, sy);
      }
      // 障碍层
      if (mapLayers.obstacle[gy][gx] === 1) {
        mmCtx.fillStyle = '#333';
        mmCtx.fillRect(gx * sx, gy * sy, sx, sy);
      }
    }
  }

  // 实体: 玩家实体始终显示, 敌方实体仅在 VISIBLE 格内显示
  for (const e of entities) {
    if (e.hp <= 0) continue;
    if (!isEnemyVisibleToPlayer(e)) continue;
    const ex = (e.x / CELL) * sx;
    const ey = (e.y / CELL) * sy;
    if (e.team === TEAM_PLAYER) {
      mmCtx.fillStyle = e.kind === 'building' ? '#0f0' : '#0a0';
    } else {
      mmCtx.fillStyle = e.kind === 'building' ? '#f00' : '#a00';
    }
    const size = e.kind === 'building' ? 4 : 2;
    mmCtx.fillRect(ex - size / 2, ey - size / 2, size, size);
  }

  // EXPLORED 区域叠加半透明遮罩 (visual cue 已探索但未点亮)
  if (window.fogEnabled) {
    mmCtx.fillStyle = 'rgba(0,0,0,0.45)';
    for (let gy = 0; gy < MAP_H; gy++) {
      for (let gx = 0; gx < MAP_W; gx++) {
        if (fogMap[gy][gx] === FOG_EXPLORED) {
          mmCtx.fillRect(gx * sx, gy * sy, sx, sy);
        }
      }
    }
  }

  const vx = (camera.x / (MAP_W * CELL)) * mw;
  const vy = (camera.y / (MAP_H * CELL)) * mh;
  const vw = (getViewportWorldWidth() / (MAP_W * CELL)) * mw;
  const vh = (getViewportWorldHeight(false) / (MAP_H * CELL)) * mh;
  mmCtx.strokeStyle = '#fff';
  mmCtx.lineWidth = 1;
  mmCtx.strokeRect(vx, vy, vw, vh);
}

// ---- UI更新 ----
