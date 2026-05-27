# FuRTS - 文字版即时战略游戏

纯 JavaScript + Canvas 实现的 RTS 游戏 Demo，致敬星际争霸 / 红色警戒。无需安装，浏览器直接运行。

<p align="center">
  <a href="https://fuzoe.github.io/FuRTS_demo/">
    <img src="https://img.shields.io/badge/%E7%82%B9%E5%87%BB%E5%BC%80%E5%A7%8B%E6%B8%B8%E6%88%8F-%E2%96%B6%20PLAY-brightgreen?style=for-the-badge&logoColor=white&labelColor=1a1a2e&color=16c60c&logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik04IDV2MTRsMTEtN3oiLz48L3N2Zz4=" alt="开始游戏" />
  </a>
</p>

---

## 特性

- **零依赖** — 一个 HTML + 两个 JS 文件，浏览器直接运行
- **文字渲染** — 用汉字代替美术素材（工、兵、弓、基、营...）
- **A\* 寻路** — 单位自动绕过岩石和建筑
- **单位碰撞** — 单位不会重叠，狭窄通道排队通过
- **编队系统** — Ctrl/Shift/Alt + 数字键，右键编队栏快捷操作
- **子组切换** — Tab 在混合选择中按类型循环
- **简易 AI** — 敌方自动采矿、建造、进攻

## 操作

| 操作 | 说明 |
|------|------|
| 左键 | 选中单位/建筑 |
| 左键拖拽 | 框选多个单位 |
| 右键空地 | 移动 |
| 右键敌人 | 攻击 |
| 右键矿石 | 采矿 |
| 双击单位 | 选择屏幕内同类型 |
| Ctrl+点击 | 选择屏幕内同类型 |
| Ctrl+数字 | 设置编队 |
| Shift+数字 | 追加到编队 |
| Alt+数字 | 独占编队 |
| 数字键 | 召回编队 |
| Tab | 子组切换 |
| WASD | 滚动地图 |

## 本地运行

```bash
git clone https://github.com/FuZoe/FuRTS_demo.git
cd FuRTS_demo
python3 -m http.server 8080
# 浏览器打开 http://localhost:8080
```

> 需要通过 HTTP 服务器打开（ES Module 不支持 `file://` 协议）。

## 项目结构

```
index.html    — 游戏主体（渲染、输入、AI、游戏循环）
map.js        — 地图数据、地形生成
entities.js   — 单位/建筑定义、创建函数
```

## License

MIT
