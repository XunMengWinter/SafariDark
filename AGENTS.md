# AGENTS.md

## 适用范围

本文件用于通用 macOS Safari Web Extension 项目，尤其是本地网页深色模式扩展。

## 文档分工

- `SPEC.md`：产品范围、功能需求、实施阶段和验收标准。
- `DESIGN.md`：通用 UI 规范，只描述界面原则、控件和状态表现。
- `AGENTS.md`：AI 编程协作规则、工程边界和验证要求。

新增或改变用户可见能力时，先更新 `SPEC.md`。修改界面时，遵守 `DESIGN.md`。

## 工程边界

- 面向 macOS Safari Web Extension；不要默认扩展到 iPhone、iPad、Chrome 或后端服务。
- 深色处理、设置读取和用户控制优先在本机完成。
- 保留既有项目架构；在现有 host app、extension、popup 和脚本契约上增量实现。
- 不引入账号、云同步、分析、广告、订阅或内购，除非 `SPEC.md` 明确要求。
- 新增权限必须能由当前功能直接解释，并同步隐私声明和发布材料。
- 文档和示例保持通用，避免写死项目名、bundle id、证书、域名或本机路径。

## 实现约定

- 共享契约变化时，同步检查 manifest、content script、background script 和 popup script。
- 站点兼容优先使用通用规则解决，例如 frame 注入、跨域 CSS、动态渲染和低对比文本修复。
- 避免优先添加域名专用补丁；确需添加时写清原因和可回退策略。
- 可选页面悬浮控件必须默认关闭，只在 top frame 注入，资源保持本地。

## 验证

改动扩展脚本后，按实际项目路径运行语法检查：

```bash
node --check '<extension-resources>/content.js'
node --check '<extension-resources>/background.js'
node --check '<extension-resources>/popup.js'
python3 -m json.tool '<extension-resources>/manifest.json' >/tmp/safari-extension-manifest.json
```

改动 Swift、Xcode 工程或发布前，运行 macOS 构建验证。若本机签名不可用，先用关闭签名的编译验证：

```bash
xcodebuild -project '<Project>.xcodeproj' -scheme '<Scheme>' -configuration Debug -derivedDataPath /tmp/<Project>DerivedData CODE_SIGNING_ALLOWED=NO build
```