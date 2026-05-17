const CSS_FETCH_MESSAGE = "safaridark.fetchCss";
const MAX_CSS_BYTES = 1_500_000;

function isHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

async function fetchCss(url) {
    if (!isHttpUrl(url)) {
        return { ok: false, error: "Unsupported stylesheet URL." };
    }

    try {
        const response = await fetch(url, {
            credentials: "omit",
            cache: "force-cache"
        });

        if (!response.ok) {
            return { ok: false, error: `HTTP ${response.status}` };
        }

        const contentType = response.headers.get("content-type") || "";
        const text = await response.text();

        if (text.length > MAX_CSS_BYTES) {
            return { ok: false, error: "Stylesheet is too large." };
        }

        if (contentType && !contentType.includes("css") && !text.includes("{")) {
            return { ok: false, error: "Response is not CSS." };
        }

        return { ok: true, css: text };
    } catch (error) {
        return { ok: false, error: String(error?.message || error) };
    }
}

browser.runtime.onMessage.addListener((request) => {
    if (request?.type !== CSS_FETCH_MESSAGE) {
        return undefined;
    }

    return fetchCss(request.url);
});
