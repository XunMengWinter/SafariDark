# IMPLEMENTED.md

## 目的

本文记录当前仓库已经实现的能力和已知边界。产品目标和验收标准仍以 `SPEC.md` 为准；本文只描述当前代码事实。

最后更新：2026-05-18。

## 项目结构

- Xcode project：`SafariDark.xcodeproj`。
- macOS host app target：`SafariDark`。
- Safari Web Extension target：`SafariDark Extension`。
- host app 入口：`SafariDark/AppDelegate.swift`、`SafariDark/ViewController.swift`。
- host app 页面：`SafariDark/Resources/Base.lproj/Main.html`、`SafariDark/Resources/Style.css`、`SafariDark/Resources/Script.js`。
- extension manifest：`SafariDark Extension/Resources/manifest.json`。
- extension 脚本：`SafariDark Extension/Resources/content.js`、`SafariDark Extension/Resources/background.js`、`SafariDark Extension/Resources/popup.js`。
- popup 页面：`SafariDark Extension/Resources/popup.html`、`SafariDark Extension/Resources/popup.css`。
- 图标与宠物资源：`SafariDark Extension/Resources/images/toolbar-icon.svg`、`SafariDark Extension/Resources/images/pet-cat.png`。

## 已实现能力

### Host App

- 展示 SafariDark 扩展状态：查询中、已启用、未启用、查询失败。
- 提供打开 Safari Settings 的按钮。
- 展示启用扩展、使用 toolbar popup、调节当前网站的基础引导。
- 隐私提示说明设置保留在本机，不上传网页内容。

### Manifest 与权限

- 使用 Manifest V3。
- content script 匹配 `<all_urls>`，在 `document_start` 运行。
- content script 开启 `all_frames` 和 `match_about_blank`，覆盖主页面、iframe 和 `about:blank` 嵌入内容。
- `web_accessible_resources` 暴露本地宠物图片 `images/pet-cat.png`。
- 权限包括 `storage`、`activeTab`、`scripting` 和 `<all_urls>` host permission。

### Popup 设置

- 支持全局模式：Dark、Original、Auto。
- 支持当前网站启用或禁用深色模式。
- 支持跳过已有深色网站。
- 支持 Brightness、Contrast、Sepia 参数。
- 支持 Safari 宠物显示开关。
- 支持恢复当前网站隐藏的宠物。
- popup 标题区显示本地猫图标，toolbar action 图标使用本地猫脸 SVG。
- 保存设置后会通知当前 tab；当前 tab 没有 content script 时，会尝试通过 `scripting.executeScript` 补注入。

### 暗色化运行时

- 页面早期插入临时深色背景，减少白闪。
- 根据模式、当前 hostname、系统深色外观、跳过深色网站设置决定是否暗色化。
- 使用页面级滤镜暗色化，并对图片、视频、canvas、svg、iframe、object、embed 等视觉媒体做反向滤镜保真。
- 扫描背景图元素，尽量避免背景图片被错误反色。
- 对低对比文本做有限修复。
- 监听 DOM 变化，动态页面内容更新后会重新应用规则。
- 跨域 stylesheet 读取失败时，通过 background script 在扩展权限内抓取 CSS，失败时降级为空。

### Safari 宠物

- 默认开启，显示在可注入网页的 top frame。
- 使用本地图片资源，不加载远程图片、脚本或样式。
- 宠物宿主节点使用固定定位和最高 z-index，并挂载到 `body` 或 `documentElement`，避免插入 `head` 导致不可见。
- 宠物通过 closed shadow DOM 封装样式和交互。
- 支持拖动，位置保存到 extension local storage。
- 点击宠物会显示轻量菜单和短提示。
- 菜单支持当前站点启用或禁用深色模式、隐藏当前网站宠物、关闭菜单。
- 宠物在深色滤镜启用时使用反向滤镜，避免图片颜色被页面滤镜反色。
- 一次性迁移标记 `safaridarkPetDefaultEnabledV1` 用于把旧本地设置迁移到宠物默认显示，并清空旧的宠物隐藏站点列表。

## 已知边界

- Safari 内部页面、Safari Settings、扩展商店和浏览器限制注入的页面无法显示宠物或应用 content script。
- 宠物只在 top frame 显示；iframe 中不单独显示宠物。
- 当前没有账号、云同步、远程配置、分析、订阅或内购。
- 当前没有 iPhone、iPad 或 Chrome 版本。
- 站点兼容仍以通用规则为主，尚未加入域名专用补丁。

## 验证命令

改动 extension 脚本后运行：

```bash
node --check 'SafariDark Extension/Resources/content.js'
node --check 'SafariDark Extension/Resources/background.js'
node --check 'SafariDark Extension/Resources/popup.js'
python3 -m json.tool 'SafariDark Extension/Resources/manifest.json' >/tmp/safari-extension-manifest.json
```

改动 Swift、Xcode 工程或发布前运行：

```bash
xcodebuild -project 'SafariDark.xcodeproj' -scheme 'SafariDark' -configuration Debug -derivedDataPath /tmp/SafariDarkDerivedData CODE_SIGNING_ALLOWED=NO build
```
