# SPEC.md

## 1. 产品目标

构建一个简洁、稳定、隐私友好的 macOS Safari Web Extension，用于在 Safari 中为网页提供本地深色模式，并提供可选的本地 Safari 宠物陪伴；也可用于在既有 macOS Safari 扩展中增量加入深色模式能力。

用户启用扩展后，可以通过 Safari toolbar popup 控制全局暗色化、当前网站开关、基础视觉参数和页面宠物显示。

## 2. 范围

### 2.1 必须支持

- macOS Safari Web Extension。
- macOS host app 或既有 Safari extension host。
- 本地网页暗色化，不依赖后端处理。
- Safari toolbar popup 日常控制。
- 全局模式：Dark / Original / Auto。
- 当前网站启用或禁用。
- Brightness / Contrast / Sepia 参数。
- 跳过已有深色网站。
- iframe 和 `about:blank` 嵌入内容。
- 跨域 CSS 抓取降级。
- 可选 Safari 全局宠物，在可注入网页的 top frame 中显示、拖动和按站点隐藏。
- extension local storage 保存设置。

### 2.2 默认不做

- iPhone 或 iPad Safari 版本。
- Chrome-only 版本。
- 深色模式不需要的账号、云同步、分析、广告、订阅或内购。
- 远程配置、远程样式、远程图片或远程脚本。

既有项目接入时，保留既有产品范围，只增加或改进深色模式能力。

## 3. 数据模型

建议默认设置：

```json
{
  "mode": "dark",
  "skipDarkSites": true,
  "brightness": 100,
  "contrast": 105,
  "sepia": 0,
  "disabledHosts": [],
  "floatingControlEnabled": true,
  "floatingControlHiddenHosts": [],
  "floatingControlPosition": { "x": 18, "y": 128 }
}
```

字段约定：

- `mode`：`dark` 强制暗色化，`original` 保持原网页，`auto` 跟随系统外观。
- `skipDarkSites`：已有深色网页是否跳过暗色化。
- `brightness`、`contrast`、`sepia`：视觉参数，保存为数字。
- `disabledHosts`：当前网站禁用列表，按 hostname 存储。
- `floatingControlEnabled`：Safari 全局宠物 / 页面快捷控制全局开关，默认开启。
- `floatingControlHiddenHosts`：宠物在当前网站隐藏列表，按 hostname 存储。
- `floatingControlPosition`：宠物拖动位置。

实现可以使用内部迁移标记记录“宠物默认开启”迁移是否已执行。迁移标记不是用户设置，不应暴露在 popup 中。

## 4. 实施阶段

### 阶段 1：项目基线

目标：识别并保留现有工程结构。

需求：

- 明确 host app、extension target、manifest、资源目录和脚本入口。
- 确认最低 macOS 版本、Safari Web Extension 能力和 bundle id。
- 既有项目不得被深色模式功能重写架构。

验收：

- 工程能正常打开和构建。
- 文档中记录实际入口文件和资源位置。

当前项目基线记录：

- Xcode project：`SafariDark.xcodeproj`。
- scheme：`SafariDark`。
- host app target：`SafariDark`。
- extension target：`SafariDark Extension`。
- host bundle id：`pet.zzz.SafariDark`。
- extension bundle id：`pet.zzz.SafariDark.Extension`。
- host app 入口：`SafariDark/AppDelegate.swift`、`SafariDark/ViewController.swift`。
- host app 本地页面资源：`SafariDark/Resources/Base.lproj/Main.html`、`SafariDark/Resources/Style.css`、`SafariDark/Resources/Script.js`。
- manifest：`SafariDark Extension/Resources/manifest.json`。
- extension 脚本入口：`SafariDark Extension/Resources/background.js`、`SafariDark Extension/Resources/content.js`、`SafariDark Extension/Resources/popup.js`。
- popup 资源：`SafariDark Extension/Resources/popup.html`、`SafariDark Extension/Resources/popup.css`。
- 当前最低系统设置：host app deployment target 为 macOS 14.6，extension deployment target 为 macOS 10.14；本阶段只记录，不调整。
- Safari Web Extension 能力：通过 `SafariDark Extension/Info.plist` 的 `com.apple.Safari.web-extension` extension point 提供。

### 阶段 2：Host App

目标：提供扩展状态展示和 Safari Settings 引导。

需求：

- 展示扩展可用、已启用、未启用或查询失败状态。
- 展示简短使用引导：在 Safari Settings 启用扩展、允许网站、通过 toolbar popup 调整模式和当前网站。
- 提供打开 Safari Settings 的主操作。
- 保持职责聚焦，不把 host app 做成完整设置中心。

验收：

- 用户能从 host app 跳转到 Safari Settings。
- 用户能在 host app 中理解启用扩展、打开 toolbar popup 和调整当前网站的基本流程。
- 扩展状态展示与 Safari 实际状态一致或能合理降级。

### 阶段 3：Manifest 与注入

目标：让内容脚本覆盖主页面和嵌入内容。

需求：

- content script 在 `document_start` 注入。
- 保留 `all_frames`，覆盖 iframe。
- 保留 `match_about_blank`，覆盖 `about:blank` 嵌入内容。
- 权限只声明功能所需范围。

验收：

- 普通页面、iframe 登录页和嵌入内容都能触发处理。
- 权限说明能直接对应功能需求。

### 阶段 4：设置读写与 Popup

目标：实现用户日常控制。

需求：

- popup 能读取当前 tab 和 hostname。
- 支持 Dark / Original / Auto 模式切换。
- 支持当前网站启用或禁用。
- 支持 skip dark websites。
- 支持 Brightness / Contrast / Sepia 调整。
- 支持 Safari 宠物全局显示开关。
- 支持恢复当前网站隐藏的宠物。
- popup 标题区可显示本地图标；若使用宠物形象，必须来自扩展本地资源。
- 旧设置迁移到当前版本时，默认开启宠物并清空旧的宠物隐藏站点列表。
- 保存后通知当前页面重新应用设置。
- 当前 tab 缺少 content script 时，popup 可主动注入。

验收：

- popup 设置无需刷新即可在当前页面生效。
- 无有效 hostname 时，站点相关控制禁用或显示不可用状态。
- 关闭并重新打开 popup 后设置保持一致。

### 阶段 5：暗色化运行时

目标：稳定处理网页视觉。

需求：

- 页面加载早期插入临时深色背景，减少白闪。
- 根据 storage、当前 hostname 和系统外观决定是否暗色化。
- `dark` 模式强制暗色化。
- `original` 模式保持原网页。
- `auto` 模式跟随 macOS 外观。
- `disabledHosts` 命中时不暗色化。
- `skipDarkSites` 开启时，已有深色网页不重复暗色化。

验收：

- 明亮网页能变暗。
- Original 能恢复原样。
- Auto 能跟随系统。
- 已有深色网站能跳过。
- 当前网站禁用和恢复生效。

### 阶段 6：跨域 CSS 与兼容性

目标：提高真实网站覆盖率。

需求：

- CSS 读取被 CORS 阻止时，由 background script 在扩展权限内抓取。
- 抓取失败时降级处理，不阻断页面。
- 支持 JavaScript app shell 延迟渲染页面。
- 修复硬编码深色文字导致的低对比文本。
- 兼容问题优先用通用规则解决，避免域名专用补丁。

验收：

- 跨域 CSS 较多的网站尽量完整暗色化。
- 动态插入内容后仍能保持合理暗色效果。
- 低对比文本不应大面积不可读。

### 阶段 7：可选 Safari 全局宠物

目标：提供可选的本地页面宠物，在 Safari 可注入网页中陪伴用户并承载轻量快捷控制。

需求：

- 默认开启。
- 只在 top frame 注入。
- 使用本地资源，不加载远程内容。
- 可视 DOM 必须挂载到 `body` 或 `documentElement`，不能挂载到 `head`。
- 支持拖动位置保存。
- 支持隐藏当前网站，并可在 popup 中恢复。
- 点击宠物显示轻量菜单，不遮挡页面主要内容。
- 宠物视觉不应被深色滤镜反色。
- Safari 内部页面、设置页、扩展商店等不可注入页面不属于显示范围。

验收：

- 默认出现在可注入网页的 top frame，位置靠左并尽量减少遮挡。
- 可拖动、隐藏和恢复。
- 点击后能显示暗色模式当前站点控制和隐藏入口。
- 在亮色或暗色网页上没有明显背景块，图片颜色保持自然。
- 旧用户升级后，未完成迁移的本地设置会自动切换为宠物显示。

## 5. 隐私与权限

新建纯深色模式插件默认：

- 不收集浏览历史。
- 不上传网页内容。
- 不读取账号或表单数据。
- 不使用分析、广告或追踪 SDK。
- 深色设置保存在 extension local storage。

既有项目接入深色模式时，隐私声明和权限必须反映实际行为。深色模式新增的数据访问和权限需要单独解释。

当前 manifest 权限说明：

- `storage`：保存全局模式、站点禁用列表、视觉参数和本地宠物状态。
- `activeTab` 与 `scripting`：popup 保存后向当前页面通知或补注入 content script，使设置尽量无需刷新生效。
- `<all_urls>` host permission：让 content script 覆盖普通网页、iframe、`about:blank` 嵌入内容，显示可选宠物，并允许 background 在扩展权限内为跨域 CSS 抓取做降级。

## 6. 手动测试清单

- 明亮网页首次加载。
- 已有深色网页跳过。
- iframe 登录页或嵌入内容。
- 跨域 CSS 较多的网站。
- JavaScript app shell 延迟渲染页面。
- 硬编码深色文字的网站。
- 每站点禁用和恢复。
- popup 设置即时生效。
- host app 扩展状态展示。
- host app 打开 Safari Settings。
- host app 使用引导覆盖启用、toolbar popup 和当前网站调节流程。
- 可选 Safari 宠物默认显示、拖动、点击菜单、隐藏和恢复。
- 旧设置迁移后，已保存的宠物关闭状态和隐藏站点不会阻止默认显示。

## 7. 完成标准

- 所有必须支持项已实现或明确标注为不适用。
- 每个实施阶段的验收项通过。
- UI 符合 `DESIGN.md`。
- 权限、隐私声明和实际行为一致。
- 语法检查、manifest 检查和 macOS 构建验证通过，或记录无法运行的原因。
