const log = (...args: any[]) => console.log("[EXT]", ...args);

// Skip iframes
if (window.self !== window.top) {
    log("Skipping content script inside iframe", location.href);
    throw new Error("Inside iframe, aborting content script");
}

function cleanText(text: string): string {
    return text.replace(/\s+/g, " ").trim();
}

function isArticlePage(): boolean {
    return /\/pulse\/|\/posts\/|\/feed\/update\//.test(location.href);
}

function isProfilePage(): boolean {
    return /\/in\//.test(location.href);
}

function extractArticleTitle(doc: Document): string {
    // LinkedIn article pages use h1 for the title
    const h1 = doc.querySelector("h1");
    if (h1) {
        const text = cleanText(h1.textContent || "");
        if (text) return text;
    }

    // Fallback to og:title meta tag
    const ogTitle = doc.querySelector('meta[property="og:title"]');
    if (ogTitle) {
        const content = ogTitle.getAttribute("content") || "";
        if (content.trim()) return content.trim();
    }

    return document.title || "";
}

function extractArticleBody(doc: Document): string {
    // LinkedIn article body containers
    const selectors = [
        ".article-content",
        ".feed-shared-update-v2__description",
        ".feed-shared-text",
        ".update-components-text",
        '[data-test-id="main-feed-activity-content"]',
    ];

    for (const sel of selectors) {
        const el = doc.querySelector(sel);
        if (el) {
            const text = cleanText(el.textContent || "");
            if (text.length > 30) return text;
        }
    }

    // Fallback: grab all <p> inside main or article
    const container = doc.querySelector("article") || doc.querySelector("main");
    if (container) {
        const paragraphs = Array.from(container.querySelectorAll("p"))
            .map((p) => cleanText(p.textContent || ""))
            .filter((t) => t.length > 10);
        if (paragraphs.length > 0) return paragraphs.join("\n\n");
    }

    // Last resort: og:description
    const ogDesc = doc.querySelector('meta[property="og:description"]');
    return ogDesc?.getAttribute("content")?.trim() || "";
}

function extractProfileSummary(doc: Document): string {
    // For profile pages, grab headline + about section
    const headline = doc.querySelector(".text-body-medium.break-words");
    const headlineText = cleanText(headline?.textContent || "");

    const aboutSection = doc.querySelector("#about")?.closest("section");
    let aboutText = "";
    if (aboutSection) {
        const spans = Array.from(aboutSection.querySelectorAll("span[aria-hidden='true']"));
        aboutText = spans.map((s) => cleanText(s.textContent || "")).filter(Boolean).join(" ");
    }

    return [headlineText, aboutText].filter(Boolean).join("\n\n");
}

async function scrapeLinkedInPage() {
    log("scrapeLinkedInPage()");

    const url = location.href;
    const doc = document;

    if (isArticlePage()) {
        const title = extractArticleTitle(doc);
        const body = extractArticleBody(doc);
        const result = { type: "article" as const, title, body, url };
        log("scraped article:", result);
        return result;
    }

    if (isProfilePage()) {
        const h1 = doc.querySelector("h1");
        const name = cleanText(h1?.textContent || "") || "Unknown Profile";
        const body = extractProfileSummary(doc);
        const result = { type: "profile" as const, title: name, body, url };
        log("scraped profile:", result);
        return result;
    }

    // Generic fallback
    const title = extractArticleTitle(doc);
    const body = extractArticleBody(doc);
    const result = { type: "page" as const, title, body, url };
    log("scraped page:", result);
    return result;
}

function initContent() {
    log("Content loaded on", location.href);

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg?.type === "SCRAPE_PAGE") {
            scrapeLinkedInPage().then((data) => {
                log("Responding SCRAPE_PAGE with", data);
                sendResponse(data);
            });
            return true;
        }
        return false;
    });
}

try {
    initContent();
} catch (e) {
    console.error("[EXT] Content init error:", e);
}
