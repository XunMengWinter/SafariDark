# SafariDark

SafariDark is a local-first macOS Safari Web Extension that darkens webpages and adds a small floating Safari pet companion.

It runs in Safari on your Mac, stores preferences in extension local storage, and does not require an account, backend service, analytics SDK, subscription, or remote configuration.

## Screenshot

<!-- Replace this placeholder with a real screenshot before publishing. -->

![SafariDark screenshot placeholder](docs/screenshot.png)

## Features

- Local webpage dark mode for Safari on macOS.
- Toolbar popup controls for Dark, Original, and Auto modes.
- Per-site enable and disable controls.
- Brightness, contrast, and sepia tuning.
- Skip pages that already provide a dark theme.
- iframe and `about:blank` content-script coverage.
- Cross-origin stylesheet fallback through the extension background script.
- Floating Safari pet shown on injectable top-frame webpages.
- Pet drag position, per-site hide, and popup restore controls.
- Local-only settings in Safari extension storage.

## Privacy

SafariDark is designed to stay local:

- No account.
- No cloud sync.
- No analytics or advertising SDK.
- No remote scripts, remote styles, or remote pet images.
- No upload of webpage content.

The extension needs broad webpage access so the content script can run on pages you allow in Safari, apply dark mode, handle iframe content, fetch cross-origin CSS through the extension background script, and display the local floating pet.

## Requirements

- macOS with Safari Web Extension support.
- Xcode.
- Safari with the SafariDark extension enabled and allowed on the websites you want to use.

Current project targets are documented in [IMPLEMENTED.md](IMPLEMENTED.md).

## Build And Run

1. Open `SafariDark.xcodeproj` in Xcode.
2. Select the `SafariDark` scheme.
3. Build and run the macOS host app.
4. In the host app, open Safari Settings.
5. Enable the SafariDark extension and allow it on the websites you want to darken.
6. Use the Safari toolbar popup to adjust dark mode and pet settings.

## Project Layout

- `SafariDark/`: macOS host app.
- `SafariDark Extension/Resources/manifest.json`: extension manifest.
- `SafariDark Extension/Resources/content.js`: webpage dark mode and pet runtime.
- `SafariDark Extension/Resources/background.js`: cross-origin CSS fetch fallback.
- `SafariDark Extension/Resources/popup.html`: toolbar popup UI.
- `SafariDark Extension/Resources/popup.js`: popup settings logic.
- `SafariDark Extension/Resources/images/pet-cat.png`: local pet image.
- `SPEC.md`: product scope and acceptance criteria.
- `IMPLEMENTED.md`: current implemented behavior and known boundaries.
- `DESIGN.md`: UI principles.
- `AGENTS.md`: AI collaboration and engineering rules.

## Verification

Run syntax checks after changing extension scripts:

```bash
node --check 'SafariDark Extension/Resources/content.js'
node --check 'SafariDark Extension/Resources/background.js'
node --check 'SafariDark Extension/Resources/popup.js'
python3 -m json.tool 'SafariDark Extension/Resources/manifest.json' >/tmp/safari-extension-manifest.json
```

Run a signing-disabled macOS build check before release or after Xcode project changes:

```bash
xcodebuild -project 'SafariDark.xcodeproj' -scheme 'SafariDark' -configuration Debug -derivedDataPath /tmp/SafariDarkDerivedData CODE_SIGNING_ALLOWED=NO build
```

## Known Boundaries

- Safari internal pages, Safari Settings, extension store pages, and other browser-restricted pages cannot be modified by the content script.
- The floating pet appears only in the top frame, not separately inside iframes.
- There is no iPhone, iPad, Chrome, backend, or sync version in this repository.

## License

No license file is included yet. Add a license before publishing if you want others to use, modify, or redistribute the code under clear terms.
