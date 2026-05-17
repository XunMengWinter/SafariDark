let settingsName = "Safari Settings";

function setText(selector, text) {
    const element = document.querySelector(selector);

    if (element) {
        element.innerText = text;
    }
}

function showStatus(state, useSettingsInsteadOfPreferences) {
    settingsName = useSettingsInsteadOfPreferences ? "Safari Settings" : "Safari Preferences";

    if (useSettingsInsteadOfPreferences) {
        setText(".open-preferences", "Open Safari Settings");
        setText(".status-detail", "Open Safari Settings to enable or review the extension.");
        setText(".steps li:first-child p", "Open Safari Settings, turn on SafariDark, then allow it on the websites you want to darken.");
    } else {
        setText(".open-preferences", "Open Safari Preferences");
        setText(".status-detail", "Open Safari Preferences to enable or review the extension.");
        setText(".steps li:first-child p", "Open Safari Preferences, turn on SafariDark, then allow it on the websites you want to darken.");
    }

    if (["on", "off", "error"].includes(state)) {
        document.body.dataset.state = state;
    } else {
        delete document.body.dataset.state;
    }
}

function show(enabled, useSettingsInsteadOfPreferences) {
    if (typeof enabled === "boolean") {
        showStatus(enabled ? "on" : "off", useSettingsInsteadOfPreferences);
        return;
    }

    showStatus("unknown", useSettingsInsteadOfPreferences);
}

function openPreferences() {
    setText("#action-message", "");
    webkit.messageHandlers.controller.postMessage("open-preferences");
}

function showOpenSettingsError() {
    const manualPath = settingsName === "Safari Settings" ? "Safari > Settings > Extensions" : "Safari > Preferences > Extensions";
    setText("#action-message", `${settingsName} did not open. Open ${manualPath} manually.`);
}

document.querySelector("button.open-preferences").addEventListener("click", openPreferences);
