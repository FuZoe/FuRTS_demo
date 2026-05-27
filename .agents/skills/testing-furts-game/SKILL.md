---
name: testing-furts-game
description: Test the FuRTS text-based RTS game demo end-to-end. Use when verifying game UI, sidebar, controls, or gameplay changes.
---

# Testing FuRTS Game Demo

## Prerequisites
- The game uses ES modules (`map.js`, `entities.js`, `index.html`) — serve via HTTP, not `file://`
- Start server: `python3 -m http.server 8080` from the repo root
- Open `http://localhost:8080` in Chrome

## Key UI Elements to Verify
- **HUD bar** (top): Shows 矿石, 人口, 单位, 敌军, 时间
- **Game canvas** (center): Renders units/buildings as Chinese text characters on dark grid
- **Sidebar** (right, 220px): Contains 选中信息, 操作面板, 小地图, 操作指南
- **Log** (bottom): Shows game events

## Common Test Scenarios

### 1. Game loads and runs
- No popup/overlay blocking the game
- HUD shows initial values: 矿石:200, 人口:3/10, 单位:3
- Time counter (时间) is incrementing (not stuck at 00:00)

### 2. Sidebar operation guide
- 📖 操作指南 section visible in sidebar with 4 subsections:
  - 鼠标操作 (mouse controls)
  - 选中农民(工)时 (worker hotkeys)
  - 选中建筑时 (building hotkeys)
  - 其他 (WASD, Esc, game objective)

### 3. Unit selection and commands
- Left-click a unit → white selection circle appears, sidebar updates with unit info
- Right-click empty ground → selected unit moves
- Right-click mineral (矿) with worker selected → unit starts mining
- Right-click enemy unit → selected combat unit attacks

### 4. Building and production
- Select worker (工), press 4 → enters build mode for 人口房
- Left-click ground → places building, worker walks to build it
- Select base (基), press 1 → queues worker production (costs 50 minerals)
- Select barracks (营), press 1/2 → produces infantry/archer

### 5. A* Pathfinding
- Units should navigate around obstacles (rocks=岩, buildings) using A* paths
- To test: select a unit and right-click on the far side of an obstacle
- Console verification: `findPath(sx, sy, ex, ey)` should return non-null array of {x,y} waypoints
- `isWalkable(gx, gy)` should return false for rocks (mapData=2) and buildings (mapData=3)

### 6. Unit Collision Separation
- Multiple units moved to the same spot should form a cluster, not stack on one pixel
- Each unit type has a collision radius (workers/soldiers/archers: 0.4 cells, tanks: 0.6 cells)
- `applyUnitSeparation()` runs every frame to push overlapping units apart

### 7. Building Blocking
- Units should path around buildings, not through them
- Old bug: `moveToward()` only checked rocks (mapData=2), not buildings (mapData=3)
- Fix: `isWalkable()` now checks both, and A* paths avoid both

## Critical Testing Tips

### Disable Enemy AI During Testing
The enemy AI is very aggressive — it attacks within ~30 seconds and can destroy the player base quickly. **Always disable the AI** at the start of testing via console:
```javascript
window._origEnemyAI = window.enemyAI;
window.enemyAI = function() {}; // disable
```
Re-enable when testing AI behavior: `window.enemyAI = window._origEnemyAI;`

### Use Console for Setup
The browser console has access to all game globals (`entities`, `mapData`, `camera`, `CELL`, `MAP_W`, `MAP_H`, etc.). Use it to:
- Teleport units: `w.x = gx * CELL + CELL/2; w.y = gy * CELL + CELL/2;`
- Move camera: `camera.x = gx * CELL; camera.y = gy * CELL;`
- Create obstacles: `mapData[gy][gx] = 2;` (rock) or `= 3;` (building marker)
- Check walkability: `isWalkable(gx, gy)`
- Compute paths: `findPath(sx, sy, ex, ey)`
- Find entities: `entities.filter(e => e.type === 'worker' && e.team === 0)`

### Creating Adversarial Test Scenarios
For pathfinding tests, random rock placement may not create good obstacles. Use console to create a rock wall:
```javascript
for (let y = 20; y <= 30; y++) mapData[y][40] = 2; // vertical wall
```
Then teleport a unit to one side and command it to the other side.

### Map Layout
- Player base: bottom-right (~gx=54, gy=34)
- Enemy base: top-left (~gx=5, gy=5)
- Rocks: randomly placed in center area (gx 20-40, gy 10-30), typically only 3-5 rocks
- Map: 60×40 grids, each grid 24px (CELL=24)
- Initial player units: 3 workers near base

### Known Edge Cases
- **Collision at d=0**: When units are at the exact same pixel, `applyUnitSeparation()` skips them (the `d > 0.01` guard prevents division-by-zero). In normal gameplay this rarely occurs since the movement command distributes units to different grid offsets.
- **Restart key**: Press `R` to restart the game (only works after game over)
- **Rock placement is random**: Each game has different rock positions. Use `mapData` to find or create obstacles.

## Tips
- Player base is in bottom-right, enemy base in top-left
- Enemy AI starts building barracks ~10s in and attacks after accumulating 3+ units
- The game might be aggressive — enemy attacks can come quickly, so disable AI or test fast
- Use WASD to scroll the map if needed
- Sidebar has `overflow-y: auto` so it scrolls if content overflows
- Box-select (left-click drag) to select multiple units, then right-click to move them all

## Devin Secrets Needed
None — the game runs entirely client-side with no external services.
