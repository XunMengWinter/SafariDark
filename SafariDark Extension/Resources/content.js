(() => {
    const CONTROLLER_KEY = "__safaridarkController";
    const STYLE_ID = "safaridark-runtime-style";
    const EARLY_STYLE_ID = "safaridark-early-style";
    const APPLY_MESSAGE = "safaridark.applySettings";
    const CSS_FETCH_MESSAGE = "safaridark.fetchCss";
    const PRESERVE_MEDIA_CLASS = "safaridark-preserve-media";
    const BACKGROUND_MEDIA_CLASS = "safaridark-background-media";
    const BACKGROUND_CONTENT_CLASS = "safaridark-background-content";
    const MAX_REPAIR_ELEMENTS = 350;
    const MIN_BACKGROUND_MEDIA_AREA = 1800;
    const LARGE_BACKGROUND_CONTAINER_AREA = 24000;
    const MAX_BACKGROUND_CONTAINER_TEXT_LENGTH = 80;
    const MEDIA_SELECTOR = "img, video, canvas, svg, iframe, object, embed, [role=\"img\"]";
    const IMMEDIATE_MEDIA_SELECTOR = "img, video, canvas, svg, iframe, object, embed";
    const INTERNAL_CLASS_NAMES = [
        PRESERVE_MEDIA_CLASS,
        BACKGROUND_MEDIA_CLASS,
        BACKGROUND_CONTENT_CLASS,
        "safaridark-repair-light-bg",
        "safaridark-repair-dark-bg"
    ];

    const DEFAULT_SETTINGS = {
        mode: "dark",
        skipDarkSites: true,
        brightness: 100,
        contrast: 105,
        sepia: 0,
        disabledHosts: [],
        floatingControlEnabled: false,
        floatingControlHiddenHosts: [],
        floatingControlPosition: { x: 16, y: 16 }
    };

    if (window[CONTROLLER_KEY]) {
        window[CONTROLLER_KEY].refreshFromStorage();
        return;
    }

    installEarlyStyle();

    const controller = {
        settings: { ...DEFAULT_SETTINGS },
        hostname: effectiveHostname(),
        stylesheetText: "",
        fetchedCssUrls: new Set(),
        fetchInFlight: false,
        mutationTimer: 0,
        repairTimer: 0,
        floatingControl: null,
        systemDarkQuery: window.matchMedia?.("(prefers-color-scheme: dark)") || null,

        async start() {
            this.bindMessages();
            this.bindSystemAppearance();
            this.bindMutations();
            await this.refreshFromStorage();
            this.collectStylesheetText();
        },

        async refreshFromStorage() {
            try {
                const stored = await browser.storage.local.get(DEFAULT_SETTINGS);
                this.settings = normalizeSettings(stored);
                this.apply();
            } catch {
                removeEarlyStyle();
            }
        },

        bindMessages() {
            browser.runtime.onMessage.addListener((request) => {
                if (request?.type !== APPLY_MESSAGE) {
                    return undefined;
                }

                this.settings = normalizeSettings(request.settings);
                this.apply();
                this.collectStylesheetText();
                return Promise.resolve({ ok: true });
            });

            browser.storage.onChanged?.addListener((changes, areaName) => {
                if (areaName !== "local") {
                    return;
                }

                const changedSettings = {};
                for (const key of Object.keys(DEFAULT_SETTINGS)) {
                    if (Object.prototype.hasOwnProperty.call(changes, key)) {
                        changedSettings[key] = changes[key].newValue;
                    }
                }

                if (Object.keys(changedSettings).length > 0) {
                    this.settings = normalizeSettings({ ...this.settings, ...changedSettings });
                    this.apply();
                }
            });
        },

        bindSystemAppearance() {
            if (!this.systemDarkQuery) {
                return;
            }

            const listener = () => this.apply();
            if (this.systemDarkQuery.addEventListener) {
                this.systemDarkQuery.addEventListener("change", listener);
            } else if (this.systemDarkQuery.addListener) {
                this.systemDarkQuery.addListener(listener);
            }
        },

        bindMutations() {
            const startObserver = () => {
                if (!document.documentElement) {
                    return;
                }

                const observer = new MutationObserver((mutations) => {
                    if (mutations.length > 0 && mutations.every(isInternalMutation)) {
                        return;
                    }

                    clearTimeout(this.mutationTimer);
                    this.mutationTimer = setTimeout(() => {
                        this.apply();
                        this.collectStylesheetText();
                    }, 250);
                });

                observer.observe(document.documentElement, {
                    attributes: true,
                    attributeFilter: ["class", "style", "src", "srcset", "data-src", "data-srcset"],
                    attributeOldValue: true,
                    childList: true,
                    subtree: true
                });
            };

            if (document.documentElement) {
                startObserver();
            } else {
                document.addEventListener("DOMContentLoaded", startObserver, { once: true });
            }
        },

        apply() {
            const active = this.shouldDarken();
            document.documentElement?.toggleAttribute("data-safaridark-active", active);
            document.documentElement?.toggleAttribute("data-safaridark-ready", true);

            if (active) {
                installRuntimeStyle(this.settings);
                markVisualMedia();
                this.scheduleContrastRepair();
            } else {
                removeRuntimeStyle();
                clearContrastRepair();
                clearMediaMarks();
            }

            removeEarlyStyle();
            this.renderFloatingControl(active);
        },

        shouldDarken() {
            if (this.settings.mode === "original") {
                return false;
            }

            if (this.hostname && this.settings.disabledHosts.includes(this.hostname)) {
                return false;
            }

            if (this.settings.mode === "auto" && !this.systemDarkQuery?.matches) {
                return false;
            }

            if (this.settings.skipDarkSites && this.isAlreadyDarkSite()) {
                return false;
            }

            return true;
        },

        isAlreadyDarkSite() {
            const rootStyle = safeComputedStyle(document.documentElement);
            const bodyStyle = safeComputedStyle(document.body);
            const background = firstOpaqueColor(
                rootStyle?.backgroundColor,
                bodyStyle?.backgroundColor,
                bodyStyle?.background,
                rootStyle?.background
            );
            const foreground = firstOpaqueColor(bodyStyle?.color, rootStyle?.color);
            const colorScheme = [
                document.documentElement?.style?.colorScheme,
                document.body?.style?.colorScheme,
                rootStyle?.colorScheme,
                bodyStyle?.colorScheme
            ].join(" ");

            if (background && foreground) {
                const backgroundLum = luminance(background);
                const foregroundLum = luminance(foreground);
                if (backgroundLum < 0.22 && foregroundLum > 0.48) {
                    return true;
                }
            }

            if (/\bcolor-scheme\s*:\s*dark\b/i.test(this.stylesheetText) && background && luminance(background) < 0.32) {
                return true;
            }

            return /\bdark\b/i.test(colorScheme) && background && luminance(background) < 0.28;
        },

        async collectStylesheetText() {
            if (this.fetchInFlight) {
                return;
            }

            this.fetchInFlight = true;
            const parts = [];
            const fetches = [];

            for (const sheet of Array.from(document.styleSheets)) {
                try {
                    if (sheet.cssRules) {
                        parts.push(Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n"));
                    }
                } catch {
                    if (sheet.href && !this.fetchedCssUrls.has(sheet.href)) {
                        this.fetchedCssUrls.add(sheet.href);
                        fetches.push(fetchStylesheet(sheet.href));
                    }
                }
            }

            const fetched = await Promise.all(fetches);
            for (const result of fetched) {
                if (result) {
                    parts.push(result);
                }
            }

            this.stylesheetText = parts.join("\n").slice(0, 500_000);
            this.fetchInFlight = false;
            this.apply();
        },

        scheduleContrastRepair() {
            clearTimeout(this.repairTimer);
            this.repairTimer = setTimeout(() => repairLowContrastText(), 180);
        },

        renderFloatingControl(active) {
            const shouldShow = window.top === window
                && this.settings.floatingControlEnabled
                && this.hostname
                && !this.settings.floatingControlHiddenHosts.includes(this.hostname);

            if (!shouldShow) {
                this.floatingControl?.destroy();
                this.floatingControl = null;
                return;
            }

            if (!this.floatingControl) {
                this.floatingControl = createFloatingControl({
                    settings: this.settings,
                    hostname: this.hostname,
                    active,
                    onChange: async (nextSettings) => {
                        this.settings = normalizeSettings(nextSettings);
                        await browser.storage.local.set(this.settings);
                        this.apply();
                    }
                });
            } else {
                this.floatingControl.update(this.settings, active);
            }
        }
    };

    window[CONTROLLER_KEY] = controller;
    controller.start();

    function installEarlyStyle() {
        if (document.getElementById(EARLY_STYLE_ID)) {
            return;
        }

        const style = document.createElement("style");
        style.id = EARLY_STYLE_ID;
        style.textContent = `
            html:not([data-safaridark-ready]) {
                background: #101113 !important;
            }
        `;
        appendToDocument(style);
    }

    function removeEarlyStyle() {
        document.getElementById(EARLY_STYLE_ID)?.remove();
    }

    function installRuntimeStyle(settings) {
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement("style");
            style.id = STYLE_ID;
            appendToDocument(style);
        }

        const pageFilter = [
            "invert(1)",
            "hue-rotate(180deg)",
            `brightness(${settings.brightness}%)`,
            `contrast(${settings.contrast}%)`,
            `sepia(${settings.sepia}%)`
        ].join(" ");

        const counterFilter = [
            "sepia(0%)",
            `contrast(${Math.round(10000 / settings.contrast)}%)`,
            `brightness(${Math.round(10000 / settings.brightness)}%)`,
            "hue-rotate(180deg)",
            "invert(1)"
        ].join(" ");

        style.textContent = `
            html[data-safaridark-active] {
                --safaridark-page-filter: ${pageFilter};
                --safaridark-counter-filter: ${counterFilter};
                background: #fff !important;
                color-scheme: dark !important;
                filter: var(--safaridark-page-filter) !important;
            }

            html[data-safaridark-active] body {
                background-color: #fff !important;
            }

            ${scopedSelector("html[data-safaridark-active]", IMMEDIATE_MEDIA_SELECTOR)},
            html[data-safaridark-active] .${PRESERVE_MEDIA_CLASS} {
                filter: var(--safaridark-counter-filter) !important;
            }

            html[data-safaridark-active] .${BACKGROUND_MEDIA_CLASS} > .${BACKGROUND_CONTENT_CLASS} {
                filter: var(--safaridark-page-filter) !important;
            }

            html[data-safaridark-active] .${BACKGROUND_MEDIA_CLASS} > .${BACKGROUND_CONTENT_CLASS}.${PRESERVE_MEDIA_CLASS},
            html[data-safaridark-active] .${BACKGROUND_MEDIA_CLASS} > .${BACKGROUND_CONTENT_CLASS} .${PRESERVE_MEDIA_CLASS} {
                filter: var(--safaridark-counter-filter) !important;
            }

            html[data-safaridark-active] input,
            html[data-safaridark-active] textarea,
            html[data-safaridark-active] select,
            html[data-safaridark-active] button {
                background-color: #fff !important;
                color: #111 !important;
            }

            html[data-safaridark-active] .safaridark-repair-light-bg {
                color: #111 !important;
            }

            html[data-safaridark-active] .safaridark-repair-dark-bg {
                color: #f2f2f2 !important;
            }
        `;
    }

    function removeRuntimeStyle() {
        document.getElementById(STYLE_ID)?.remove();
        document.documentElement?.removeAttribute("data-safaridark-active");
    }

    function scopedSelector(scope, selectorList) {
        return selectorList
            .split(",")
            .map((selector) => `${scope} ${selector.trim()}`)
            .join(",\n            ");
    }

    function markVisualMedia() {
        if (!document.body) {
            return;
        }

        const marked = new Set();

        for (const element of Array.from(document.body.querySelectorAll("*"))) {
            if (shouldSkipVisualElement(element) || !hasPreservableBackgroundImage(element) || hasPreserveAncestorWithoutReapply(element, marked)) {
                continue;
            }

            element.classList.add(PRESERVE_MEDIA_CLASS, BACKGROUND_MEDIA_CLASS);
            marked.add(element);
            markBackgroundContent(element, marked);
        }

        for (const element of Array.from(document.querySelectorAll(MEDIA_SELECTOR))) {
            if (shouldSkipVisualElement(element) || hasPreserveAncestorWithoutReapply(element, marked)) {
                continue;
            }

            element.classList.add(PRESERVE_MEDIA_CLASS);
            element.classList.remove(BACKGROUND_MEDIA_CLASS);
            marked.add(element);
        }

        cleanupMediaMarks(marked);
    }

    function markBackgroundContent(element, marked) {
        for (const child of Array.from(element.children)) {
            if (shouldSkipVisualElement(child) || isVisualMediaElement(child) || hasPreservableBackgroundImage(child)) {
                continue;
            }

            child.classList.add(BACKGROUND_CONTENT_CLASS);
            marked.add(child);
        }
    }

    function cleanupMediaMarks(marked) {
        document.querySelectorAll(`.${PRESERVE_MEDIA_CLASS}, .${BACKGROUND_MEDIA_CLASS}, .${BACKGROUND_CONTENT_CLASS}`).forEach((element) => {
            if (marked.has(element)) {
                return;
            }

            element.classList.remove(PRESERVE_MEDIA_CLASS, BACKGROUND_MEDIA_CLASS, BACKGROUND_CONTENT_CLASS);
        });
    }

    function clearMediaMarks() {
        cleanupMediaMarks(new Set());
    }

    function shouldSkipVisualElement(element) {
        if (!(element instanceof Element)) {
            return true;
        }

        if (isSafariDarkOwnedElement(element)) {
            return true;
        }

        return ["HTML", "HEAD", "BODY", "SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT", "TEMPLATE"].includes(element.tagName);
    }

    function isVisualMediaElement(element) {
        return element.matches?.(MEDIA_SELECTOR) || false;
    }

    function hasPreservableBackgroundImage(element) {
        const style = safeComputedStyle(element);
        const backgroundImage = style?.backgroundImage;
        if (typeof backgroundImage !== "string" || !/\burl\(|image-set\(/i.test(backgroundImage)) {
            return false;
        }

        const rect = element.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area < MIN_BACKGROUND_MEDIA_AREA) {
            return false;
        }

        if (!hasScaledBackground(style) && hasRepeatingBackground(style)) {
            return false;
        }

        if (isLargeTextContainer(element, style, area)) {
            return false;
        }

        return true;
    }

    function hasScaledBackground(style) {
        const size = `${style?.backgroundSize || ""}`.toLowerCase();
        return /\bcover\b|\bcontain\b|(?:^|[\s,])(?:\d+(?:\.\d+)?%|calc\()/i.test(size);
    }

    function hasRepeatingBackground(style) {
        const repeat = [
            style?.backgroundRepeat,
            style?.backgroundRepeatX,
            style?.backgroundRepeatY
        ].filter(Boolean).join(" ").toLowerCase();
        const tokens = repeat.split(/[\s,]+/).filter(Boolean);
        return tokens.some((token) => ["repeat", "repeat-x", "repeat-y", "space", "round"].includes(token));
    }

    function isLargeTextContainer(element, style, area) {
        if (area < LARGE_BACKGROUND_CONTAINER_AREA || hasScaledBackground(style)) {
            return false;
        }

        const text = element.textContent?.trim().replace(/\s+/g, " ") || "";
        return text.length > MAX_BACKGROUND_CONTAINER_TEXT_LENGTH && element.childElementCount > 0;
    }

    function hasPreserveAncestorWithoutReapply(element, marked) {
        let current = element.parentElement;
        while (current && current !== document.documentElement) {
            if (current.classList?.contains(BACKGROUND_CONTENT_CLASS)) {
                return false;
            }

            if (marked.has(current) || current.classList?.contains(PRESERVE_MEDIA_CLASS)) {
                return true;
            }

            current = current.parentElement;
        }

        return false;
    }

    function appendToDocument(node) {
        const parent = document.head || document.documentElement || document.body;
        if (parent) {
            parent.appendChild(node);
        } else {
            document.addEventListener("DOMContentLoaded", () => appendToDocument(node), { once: true });
        }
    }

    function clearContrastRepair() {
        document.querySelectorAll(".safaridark-repair-light-bg, .safaridark-repair-dark-bg").forEach((element) => {
            element.classList.remove("safaridark-repair-light-bg", "safaridark-repair-dark-bg");
        });
    }

    function repairLowContrastText() {
        if (!document.body || !document.documentElement?.hasAttribute("data-safaridark-active")) {
            return;
        }

        clearContrastRepair();
        const selector = "a, button, dd, div, dt, h1, h2, h3, h4, h5, h6, input, label, li, p, select, span, td, textarea, th";
        const elements = Array.from(document.body.querySelectorAll(selector)).slice(0, MAX_REPAIR_ELEMENTS);

        for (const element of elements) {
            if (!hasTextContent(element) || !isVisible(element)) {
                continue;
            }

            const style = safeComputedStyle(element);
            const foreground = parseColor(style?.color);
            const background = effectiveBackgroundColor(element);
            if (!foreground || !background || contrastRatio(foreground, background) >= 3.6) {
                continue;
            }

            if (luminance(background) >= 0.5) {
                element.classList.add("safaridark-repair-light-bg");
            } else {
                element.classList.add("safaridark-repair-dark-bg");
            }
        }
    }

    function createFloatingControl(options) {
        const host = document.createElement("div");
        host.id = "safaridark-floating-control";
        host.style.position = "fixed";
        host.style.zIndex = "2147483647";
        host.style.left = `${options.settings.floatingControlPosition.x}px`;
        host.style.top = `${options.settings.floatingControlPosition.y}px`;
        host.style.width = "42px";
        host.style.height = "42px";
        appendToDocument(host);

        const shadow = host.attachShadow({ mode: "closed" });
        shadow.innerHTML = `
            <style>
                :host { all: initial; }
                .wrap {
                    position: relative;
                    font: 13px/1.3 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
                }
                button {
                    font: inherit;
                }
                .trigger {
                    width: 42px;
                    height: 42px;
                    border: 1px solid rgba(255,255,255,.32);
                    border-radius: 50%;
                    background: rgba(20, 22, 26, .72);
                    color: white;
                    font-weight: 700;
                    box-shadow: 0 6px 18px rgba(0,0,0,.18);
                    -webkit-backdrop-filter: blur(12px);
                    backdrop-filter: blur(12px);
                }
                .menu {
                    position: absolute;
                    top: 48px;
                    left: 0;
                    display: none;
                    min-width: 142px;
                    padding: 6px;
                    border: 1px solid rgba(0,0,0,.14);
                    border-radius: 8px;
                    background: rgba(246,246,246,.92);
                    box-shadow: 0 10px 26px rgba(0,0,0,.18);
                    -webkit-backdrop-filter: blur(16px);
                    backdrop-filter: blur(16px);
                }
                .menu.open {
                    display: grid;
                    gap: 4px;
                }
                .menu button {
                    width: 100%;
                    padding: 6px 8px;
                    border: 0;
                    border-radius: 6px;
                    background: transparent;
                    color: #111;
                    text-align: left;
                }
                .menu button:hover {
                    background: rgba(0,0,0,.08);
                }
            </style>
            <div class="wrap">
                <button class="trigger" type="button" aria-label="SafariDark page controls" title="SafariDark">D</button>
                <div class="menu" role="menu">
                    <button class="toggle-site" type="button"></button>
                    <button class="hide-site" type="button">Hide on this site</button>
                    <button class="close" type="button">Close</button>
                </div>
            </div>
        `;

        const trigger = shadow.querySelector(".trigger");
        const menu = shadow.querySelector(".menu");
        const toggleSite = shadow.querySelector(".toggle-site");
        const hideSite = shadow.querySelector(".hide-site");
        const close = shadow.querySelector(".close");
        let settings = normalizeSettings(options.settings);
        let active = options.active;
        let drag = null;
        let moved = false;

        function update(nextSettings, nextActive) {
            settings = normalizeSettings(nextSettings);
            active = nextActive;
            toggleSite.textContent = settings.disabledHosts.includes(options.hostname) ? "Enable here" : "Disable here";
            trigger.style.background = active ? "rgba(20, 22, 26, .78)" : "rgba(92, 92, 96, .62)";
            placeControl(settings.floatingControlPosition);
        }

        function placeControl(position) {
            host.style.left = `${Math.min(Math.max(position.x, 0), Math.max(0, window.innerWidth - 46))}px`;
            host.style.top = `${Math.min(Math.max(position.y, 0), Math.max(0, window.innerHeight - 46))}px`;
        }

        trigger.addEventListener("pointerdown", (event) => {
            moved = false;
            drag = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                originX: host.offsetLeft,
                originY: host.offsetTop
            };
            trigger.setPointerCapture(event.pointerId);
        });

        trigger.addEventListener("pointermove", (event) => {
            if (!drag || drag.pointerId !== event.pointerId) {
                return;
            }

            const dx = event.clientX - drag.startX;
            const dy = event.clientY - drag.startY;
            if (Math.abs(dx) + Math.abs(dy) > 4) {
                moved = true;
            }

            placeControl({ x: drag.originX + dx, y: drag.originY + dy });
        });

        trigger.addEventListener("pointerup", async (event) => {
            if (!drag || drag.pointerId !== event.pointerId) {
                return;
            }

            trigger.releasePointerCapture(event.pointerId);
            drag = null;

            settings.floatingControlPosition = { x: host.offsetLeft, y: host.offsetTop };
            await options.onChange(settings);

            if (!moved) {
                menu.classList.toggle("open");
            }
        });

        toggleSite.addEventListener("click", async () => {
            const disabled = settings.disabledHosts.includes(options.hostname);
            settings.disabledHosts = updateHostList(settings.disabledHosts, options.hostname, !disabled);
            await options.onChange(settings);
            update(settings, !settings.disabledHosts.includes(options.hostname));
        });

        hideSite.addEventListener("click", async () => {
            settings.floatingControlHiddenHosts = updateHostList(settings.floatingControlHiddenHosts, options.hostname, true);
            await options.onChange(settings);
            destroy();
        });

        close.addEventListener("click", () => menu.classList.remove("open"));
        window.addEventListener("resize", () => placeControl(settings.floatingControlPosition));

        function destroy() {
            host.remove();
        }

        update(settings, active);
        return { update, destroy };
    }

    async function fetchStylesheet(url) {
        try {
            const response = await browser.runtime.sendMessage({ type: CSS_FETCH_MESSAGE, url });
            return response?.ok ? response.css : "";
        } catch {
            return "";
        }
    }

    function normalizeSettings(value) {
        const normalized = { ...DEFAULT_SETTINGS, ...value };
        normalized.mode = ["dark", "original", "auto"].includes(normalized.mode) ? normalized.mode : DEFAULT_SETTINGS.mode;
        normalized.skipDarkSites = Boolean(normalized.skipDarkSites);
        normalized.brightness = clampNumber(normalized.brightness, 60, 140, DEFAULT_SETTINGS.brightness);
        normalized.contrast = clampNumber(normalized.contrast, 60, 160, DEFAULT_SETTINGS.contrast);
        normalized.sepia = clampNumber(normalized.sepia, 0, 60, DEFAULT_SETTINGS.sepia);
        normalized.disabledHosts = normalizeHostList(normalized.disabledHosts);
        normalized.floatingControlEnabled = Boolean(normalized.floatingControlEnabled);
        normalized.floatingControlHiddenHosts = normalizeHostList(normalized.floatingControlHiddenHosts);
        normalized.floatingControlPosition = normalizePosition(normalized.floatingControlPosition);
        return normalized;
    }

    function normalizeHostList(value) {
        if (!Array.isArray(value)) {
            return [];
        }

        return [...new Set(value.filter((host) => typeof host === "string" && host.trim()).map((host) => host.toLowerCase()))];
    }

    function normalizePosition(value) {
        if (!value || typeof value !== "object") {
            return { ...DEFAULT_SETTINGS.floatingControlPosition };
        }

        return {
            x: clampNumber(value.x, 0, 10000, DEFAULT_SETTINGS.floatingControlPosition.x),
            y: clampNumber(value.y, 0, 10000, DEFAULT_SETTINGS.floatingControlPosition.y)
        };
    }

    function clampNumber(value, min, max, fallback) {
        const number = Number(value);
        if (!Number.isFinite(number)) {
            return fallback;
        }

        return Math.min(max, Math.max(min, number));
    }

    function updateHostList(list, hostname, shouldInclude) {
        const next = new Set(normalizeHostList(list));
        if (shouldInclude) {
            next.add(hostname);
        } else {
            next.delete(hostname);
        }

        return [...next].sort();
    }

    function effectiveHostname() {
        for (const value of [window.location.href, document.referrer]) {
            try {
                const url = new URL(value);
                if (url.protocol === "http:" || url.protocol === "https:") {
                    return url.hostname.toLowerCase();
                }
            } catch {
                continue;
            }
        }

        try {
            return window.top.location.hostname.toLowerCase();
        } catch {
            return "";
        }
    }

    function safeComputedStyle(element) {
        if (!element) {
            return null;
        }

        try {
            return getComputedStyle(element);
        } catch {
            return null;
        }
    }

    function firstOpaqueColor(...values) {
        for (const value of values) {
            const color = parseColor(value);
            if (color && color.a > 0.05) {
                return color;
            }
        }

        return null;
    }

    function parseColor(value) {
        if (!value || typeof value !== "string" || value === "transparent") {
            return null;
        }

        const rgb = value.match(/rgba?\(([^)]+)\)/i);
        if (!rgb) {
            return null;
        }

        const parts = rgb[1].split(",").map((part) => Number.parseFloat(part.trim()));
        if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) {
            return null;
        }

        return {
            r: Math.min(255, Math.max(0, parts[0])),
            g: Math.min(255, Math.max(0, parts[1])),
            b: Math.min(255, Math.max(0, parts[2])),
            a: parts.length >= 4 ? Math.min(1, Math.max(0, parts[3])) : 1
        };
    }

    function luminance(color) {
        const values = [color.r, color.g, color.b].map((channel) => {
            const value = channel / 255;
            return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });

        return (0.2126 * values[0]) + (0.7152 * values[1]) + (0.0722 * values[2]);
    }

    function contrastRatio(a, b) {
        const lighter = Math.max(luminance(a), luminance(b));
        const darker = Math.min(luminance(a), luminance(b));
        return (lighter + 0.05) / (darker + 0.05);
    }

    function effectiveBackgroundColor(element) {
        let current = element;
        while (current && current !== document) {
            const color = parseColor(safeComputedStyle(current)?.backgroundColor);
            if (color && color.a > 0.05) {
                return color;
            }
            current = current.parentElement;
        }

        return parseColor("rgb(255, 255, 255)");
    }

    function hasTextContent(element) {
        return Boolean(element.textContent && element.textContent.trim().length > 0);
    }

    function isVisible(element) {
        const style = safeComputedStyle(element);
        if (!style || style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) {
            return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function isInternalMutation(mutation) {
        if (mutation.type === "childList") {
            const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
            return nodes.length > 0 && nodes.every(isSafariDarkOwnedNode);
        }

        if (mutation.type !== "attributes") {
            return false;
        }

        if (isSafariDarkOwnedElement(mutation.target)) {
            return true;
        }

        if (mutation.attributeName === "class") {
            return stripInternalClasses(mutation.oldValue || "") === stripInternalClasses(mutation.target.getAttribute("class") || "");
        }

        return false;
    }

    function stripInternalClasses(value) {
        return value
            .split(/\s+/)
            .filter((className) => className && !INTERNAL_CLASS_NAMES.includes(className))
            .sort()
            .join(" ");
    }

    function isSafariDarkOwnedNode(node) {
        if (!(node instanceof Element)) {
            return false;
        }

        return isSafariDarkOwnedElement(node);
    }

    function isSafariDarkOwnedElement(element) {
        return element.id === STYLE_ID
            || element.id === EARLY_STYLE_ID
            || element.id === "safaridark-floating-control"
            || Boolean(element.closest?.("#safaridark-floating-control"));
    }
})();
