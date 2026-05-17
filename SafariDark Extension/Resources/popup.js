const APPLY_MESSAGE = "safaridark.applySettings";

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

const elements = {};
let activeTab = null;
let currentHostname = "";
let settings = { ...DEFAULT_SETTINGS };
let saveTimer = 0;

document.addEventListener("DOMContentLoaded", init);

async function init() {
    bindElements();
    bindEvents();

    try {
        [activeTab, settings] = await Promise.all([getActiveTab(), loadSettings()]);
        currentHostname = hostnameFromTab(activeTab);
        render();
    } catch (error) {
        setMessage(`Could not load settings: ${errorMessage(error)}`);
    }
}

function bindElements() {
    for (const id of [
        "site-label",
        "status-pill",
        "site-detail",
        "site-enabled",
        "skip-dark-sites",
        "brightness",
        "brightness-value",
        "contrast",
        "contrast-value",
        "sepia",
        "sepia-value",
        "floating-enabled",
        "restore-floating",
        "message"
    ]) {
        elements[id] = document.getElementById(id);
    }
}

function bindEvents() {
    document.querySelectorAll('input[name="mode"]').forEach((input) => {
        input.addEventListener("change", () => {
            if (input.checked) {
                settings.mode = input.value;
                saveAndApply();
            }
        });
    });

    elements["site-enabled"].addEventListener("change", () => {
        if (!currentHostname) {
            return;
        }

        settings.disabledHosts = updateHostList(settings.disabledHosts, currentHostname, !elements["site-enabled"].checked);
        renderSiteControls();
        saveAndApply();
    });

    elements["skip-dark-sites"].addEventListener("change", () => {
        settings.skipDarkSites = elements["skip-dark-sites"].checked;
        saveAndApply();
    });

    for (const key of ["brightness", "contrast", "sepia"]) {
        elements[key].addEventListener("input", () => {
            settings[key] = Number(elements[key].value);
            renderSliderValue(key);
            saveAndApply(120);
        });
    }

    elements["floating-enabled"].addEventListener("change", () => {
        settings.floatingControlEnabled = elements["floating-enabled"].checked;
        saveAndApply();
    });

    elements["restore-floating"].addEventListener("click", () => {
        if (!currentHostname) {
            return;
        }

        settings.floatingControlHiddenHosts = updateHostList(settings.floatingControlHiddenHosts, currentHostname, false);
        renderSiteControls();
        saveAndApply();
    });
}

async function getActiveTab() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
}

async function loadSettings() {
    const stored = await browser.storage.local.get(DEFAULT_SETTINGS);
    return normalizeSettings(stored);
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

function hostnameFromTab(tab) {
    if (!tab?.url) {
        return "";
    }

    try {
        const url = new URL(tab.url);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return "";
        }

        return url.hostname.toLowerCase();
    } catch {
        return "";
    }
}

function render() {
    document.querySelector(`input[name="mode"][value="${settings.mode}"]`).checked = true;
    elements["skip-dark-sites"].checked = settings.skipDarkSites;
    elements["floating-enabled"].checked = settings.floatingControlEnabled;

    for (const key of ["brightness", "contrast", "sepia"]) {
        elements[key].value = String(settings[key]);
        renderSliderValue(key);
    }

    renderSiteControls();
    setMessage("Settings apply immediately.");
}

function renderSiteControls() {
    const siteAvailable = Boolean(currentHostname);
    const disabled = siteAvailable && settings.disabledHosts.includes(currentHostname);
    const floatingHidden = siteAvailable && settings.floatingControlHiddenHosts.includes(currentHostname);

    elements["site-label"].textContent = siteAvailable ? currentHostname : "No webpage selected";
    elements["site-detail"].textContent = siteAvailable ? (disabled ? "Dark mode is disabled here." : "Dark mode can run on this site.") : "Site controls are available on webpages.";
    elements["site-enabled"].disabled = !siteAvailable;
    elements["site-enabled"].checked = siteAvailable && !disabled;
    elements["restore-floating"].disabled = !siteAvailable || !floatingHidden;
    elements["restore-floating"].textContent = floatingHidden ? "Restore on this site" : "Page control visible here";
}

function renderSliderValue(key) {
    const suffix = key === "sepia" ? "%" : "%";
    elements[`${key}-value`].textContent = `${settings[key]}${suffix}`;
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

function saveAndApply(delay = 0) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        try {
            await browser.storage.local.set(settings);
            await notifyCurrentTab();
            setMessage("Saved.");
        } catch (error) {
            setMessage(`Saved locally. Refresh may be needed: ${errorMessage(error)}`);
        }
    }, delay);
}

async function notifyCurrentTab() {
    if (!activeTab?.id) {
        return;
    }

    const message = { type: APPLY_MESSAGE, settings };

    try {
        await browser.tabs.sendMessage(activeTab.id, message);
        return;
    } catch {
        await injectContentScript(activeTab.id);
    }

    await browser.tabs.sendMessage(activeTab.id, message);
}

async function injectContentScript(tabId) {
    if (!browser.scripting?.executeScript) {
        throw new Error("Content script is not available on this page.");
    }

    await browser.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ["content.js"]
    });
}

function setMessage(message) {
    elements.message.textContent = message;
}

function errorMessage(error) {
    return String(error?.message || error || "Unknown error");
}
