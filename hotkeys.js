const HOTKEYS = [
  { category: '基础操作', keys: [
    { key: '左键', desc: '选中单位或建筑' },
    { key: '左键拖拽', desc: '框选多个单位' },
    { key: '右键', desc: '移动、攻击、采矿、修建' },
    { key: 'Shift+右键', desc: '排队指令' },
    { key: '双击单位', desc: '选中屏幕内同类型单位' },
    { key: 'Ctrl+点击', desc: '选中屏幕内同类型单位' },
  ]},
  { category: '视野与地图', keys: [
    { key: 'WASD', desc: '滚动地图' },
    { key: '方向键', desc: '滚动地图' },
    { key: '小地图左键', desc: '移动镜头' },
  ]},
  { category: '编队', keys: [
    { key: 'Ctrl+1-9', desc: '设置编队' },
    { key: 'Shift+1-9', desc: '追加到编队' },
    { key: 'Alt+1-9', desc: '独占编队' },
    { key: '1-9', desc: '召回编队' },
    { key: 'Tab', desc: '子组切换' },
  ]},
  { category: '生产与建造', keys: [
    { key: '1', desc: '基地生产工人；兵营生产士兵' },
    { key: '2', desc: '工人建造兵营；兵营生产远程兵' },
    { key: '3', desc: '工人建造工厂；工厂生产坦克' },
    { key: '4', desc: '工人建造人口房' },
    { key: 'Esc', desc: '取消建造模式或生产队列' },
  ]},
  { category: '其他', keys: [
    { key: 'R', desc: '游戏结束后重新开始' },
    { key: 'F10 / ?', desc: '显示此菜单' },
    { key: '任意键', desc: '关闭快捷键速查' },
  ]},
];

let hotkeyOverlay;

function createHotkeyOverlay() {
  hotkeyOverlay = document.createElement('div');
  hotkeyOverlay.id = 'hotkeyOverlay';
  hotkeyOverlay.hidden = true;
  hotkeyOverlay.setAttribute('aria-modal', 'true');
  hotkeyOverlay.setAttribute('role', 'dialog');
  hotkeyOverlay.setAttribute('aria-labelledby', 'hotkeyTitle');

  hotkeyOverlay.innerHTML = `
    <div id="hotkeyPanel">
      <h2 id="hotkeyTitle">快捷键速查</h2>
      <div id="hotkeyContent"></div>
      <div class="hotkey-footer">按任意键关闭</div>
    </div>
  `;

  document.body.appendChild(hotkeyOverlay);
  renderHotkeyOverlay();
}

function renderHotkeyOverlay() {
  const hotkeyContent = document.getElementById('hotkeyContent');
  hotkeyContent.replaceChildren(...HOTKEYS.map((group) => {
    const section = document.createElement('section');
    section.className = 'hotkey-category';

    const title = document.createElement('h3');
    title.textContent = group.category;
    section.appendChild(title);

    for (const item of group.keys) {
      const row = document.createElement('div');
      row.className = 'hotkey-row';

      const key = document.createElement('span');
      key.className = 'hotkey-key';
      key.textContent = item.key;

      const desc = document.createElement('span');
      desc.className = 'hotkey-desc';
      desc.textContent = item.desc;

      row.append(key, desc);
      section.appendChild(row);
    }

    return section;
  }));
}

function isHotkeyOverlayVisible() {
  return hotkeyOverlay && !hotkeyOverlay.hidden;
}

function showHotkeyOverlay() {
  hotkeyOverlay.hidden = false;
}

function hideHotkeyOverlay() {
  hotkeyOverlay.hidden = true;
}

function isHotkeyOverlayToggle(e) {
  return e.key === 'F10' || e.key === '?' || (e.key === '/' && e.shiftKey);
}

document.addEventListener('DOMContentLoaded', createHotkeyOverlay);

window.addEventListener('keydown', (e) => {
  if (!hotkeyOverlay) return;

  if (isHotkeyOverlayVisible()) {
    e.preventDefault();
    e.stopImmediatePropagation();
    hideHotkeyOverlay();
    return;
  }

  if (isHotkeyOverlayToggle(e)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    showHotkeyOverlay();
  }
}, true);
