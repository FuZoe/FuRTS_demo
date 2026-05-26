---
name: testing-furts-game
description: Test the FuRTS text-based RTS game demo end-to-end. Use when verifying game UI, sidebar, controls, or gameplay changes.
---

# Testing FuRTS Game Demo

## Prerequisites
- The game is a single `index.html` file with zero dependencies
- Serve it via `python3 -m http.server 8080` from the repo root (do not open via `file://` — Chrome may mangle the path)
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

## Tips
- Player base is in bottom-right, enemy base in top-left
- Enemy AI starts building barracks ~10s in and attacks after accumulating 3+ units
- The game might be aggressive — enemy attacks can come quickly, so test fast or reload
- Use WASD to scroll the map if needed
- Sidebar has `overflow-y: auto` so it scrolls if content overflows

## Devin Secrets Needed
None — the game runs entirely client-side with no external services.
