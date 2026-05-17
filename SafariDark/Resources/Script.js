function showStatus(state, useSettingsInsteadOfPreferences) {
    if (useSettingsInsteadOfPreferences) {
        document.getElementsByClassName("state-unknown")[0].innerText = "SafariDark can darken webpages locally after you enable the extension in Safari Settings.";
        document.getElementsByClassName("state-off")[0].innerText = "SafariDark is installed but not enabled in Safari Settings.";
        document.getElementsByClassName("state-error")[0].innerText = "SafariDark could not read the current extension state. You can still check it in Safari Settings.";
        document.getElementsByClassName("open-preferences")[0].innerText = "Open Safari Settings";
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
    webkit.messageHandlers.controller.postMessage("open-preferences");
}

document.querySelector("button.open-preferences").addEventListener("click", openPreferences);
