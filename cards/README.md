# 扑克合集 PWA

Vite + React + TypeScript 版单机扑克合集，包含 414、斗地主、跑得快、掼蛋。构建产物是纯静态文件，会通过 GitHub Actions 发布到 `https://pwa-game.github.io/games/cards/`；首次联网加载后通过 service worker 离线运行。

## 本地运行

```sh
npm ci
npm run dev
```

生产构建和本地预览：

```sh
npm run test
npm run build
npm run preview
```

## iPhone 安装

- 本地开发可用 `localhost` 测试；真机安装需要 HTTPS。
- 部署到 GitHub Pages 后，用 iPhone Safari 打开 `https://pwa-game.github.io/games/cards/`。
- 点 Safari 分享按钮，选择“添加到主屏幕”。
- 从主屏幕图标启动后会以 standalone 模式运行，没有 Safari 地址栏。
- 首次打开并缓存完成后，飞行模式下仍可进入并开局。

## GitHub Pages

这个项目源码保留在 `cards/`。仓库根目录的 `.github/workflows/pages.yml` 会运行测试和构建，并把 `cards/dist/` 复制到最终站点的 `/games/cards/`。

## PWA 配置

- `public/manifest.webmanifest` 和 `vite-plugin-pwa` manifest 设置了 `display: standalone`、`orientation: landscape`、`start_url: "."`、`scope: "."`。
- `index.html` 包含 iOS Home Screen 需要的 `apple-mobile-web-app-*` meta 和 `apple-touch-icon`。
- Workbox 预缓存 app shell、JS/CSS、图标和音效；导航请求 fallback 到 `index.html`。
- 运行时会提示 iOS 用户通过分享菜单添加到主屏幕，并在 service worker 有新版本时显示刷新提示。

## 代码结构

- `src/core/`：共享扑克牌、牌型识别、比较、公开记牌、音效和特效描述。
- `src/games/`：四个玩法的状态机、发牌、轮转、AI 接入和 UI 适配。
- `src/ui/`：可复用牌面和桌面特效层。
- `src/test/`：Vitest 规则和模块 smoke tests。
- `public/`：manifest、icons、音效。

## 首版范围

- 支持本地单机，不做联网、账号、排行榜或原生 App 数据同步。
- UI 共用同一套横屏牌桌；规则和 AI 分玩法独立实现。
- 414 支持 3/4 人、1-3 副、休闲/竞技 AI、叉/勾和公开记牌输入。
- 斗地主、跑得快、掼蛋首版目标是合法动作稳定和可完整游玩；复杂 AI 权重后续可继续按 Swift 版本逐项对齐。
