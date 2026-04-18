import "./Popup.css";
import { useEffect, useState } from "react";

type ScrapedPage = {
    type: "article" | "profile" | "page";
    title: string;
    body: string;
    url: string;
} | null;

function sendMessageToTab(tabId: number, message: any): Promise<any> {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
            const err = chrome.runtime.lastError;
            if (err) {
                reject(err);
            } else {
                resolve(response);
            }
        });
    });
}

async function ensureContentInjected(tabId: number) {
    await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
    });
    await new Promise((r) => setTimeout(r, 150));
}

export default function Popup() {
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [url, setUrl] = useState("");
    const [userNotes, setUserNotes] = useState("");
    const [status, setStatus] = useState("");
    const [scraped, setScraped] = useState<ScrapedPage>(null);
    const [configReady, setConfigReady] = useState(false);
    const [configMissing, setConfigMissing] = useState(false);
    const [araReady, setAraReady] = useState(false);
    const [isScraping, setIsScraping] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isScrapablePage, setIsScrapablePage] = useState(true);
    const [resultSummary, setResultSummary] = useState("");
    const [resultCategory, setResultCategory] = useState("");

    async function openSettingsSidePanel(setStatus?: (msg: string) => void) {
        if (!chrome.sidePanel) {
            if (setStatus) setStatus("Side panel API not available.");
            return;
        }

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || tab.windowId === undefined) {
                if (setStatus) setStatus("No active browser window found.");
                return;
            }

            await chrome.sidePanel.open({ windowId: tab.windowId });
            if (setStatus) setStatus("Configure credentials in the side panel.");
        } catch (e) {
            console.error("Failed to open side panel", e);
            if (setStatus) setStatus("Could not open side panel.");
        }
    }

    // Check Notion config on mount
    useEffect(() => {
        chrome.storage.local.get(
            ["linkedin_to_notion_API", "linkedin_to_notion_database"],
            (res) => {
                const missing =
                    !res.linkedin_to_notion_API || !res.linkedin_to_notion_database;

                if (missing) {
                    setConfigMissing(true);
                    setStatus("Notion is not configured yet.");
                    return;
                }

                chrome.runtime.sendMessage({ type: "PING_NOTION" }, (response) => {
                    const err = chrome.runtime.lastError;
                    if (err || !response?.ok) {
                        setConfigMissing(true);
                        setStatus("Notion token is invalid. Please configure settings.");
                        return;
                    }
                    setConfigReady(true);
                });
            }
        );

        // Check Ara config
        chrome.runtime.sendMessage({ type: "PING_ARA" }, (response) => {
            if (response?.ok) setAraReady(true);
        });
    }, []);

    // Scrape page when config is ready
    useEffect(() => {
        if (!configReady) return;

        (async () => {
            setIsScraping(true);
            setIsScrapablePage(true);
            setStatus("Scraping page...");
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab || !tab.id || !tab.url || !tab.url.includes("linkedin.com")) {
                    setIsScraping(false);
                    setIsScrapablePage(false);
                    setStatus("Open a LinkedIn page to use this extension.");
                    return;
                }

                let data: any;
                try {
                    data = await sendMessageToTab(tab.id, { type: "SCRAPE_PAGE" });
                } catch (err) {
                    console.warn("First scrape failed, injecting and retrying…", err);
                    await ensureContentInjected(tab.id);
                    data = await sendMessageToTab(tab.id, { type: "SCRAPE_PAGE" });
                }

                console.log("[EXT] Scraped:", data);
                if (!data) {
                    setIsScraping(false);
                    setIsScrapablePage(false);
                    setStatus("Could not scrape content from this page.");
                    return;
                }

                setScraped(data);
                setTitle(data.title || "");
                setBody(data.body || "");
                setUrl(data.url || "");
                setUserNotes("");
                setIsScraping(false);
                setIsScrapablePage(true);
                setStatus("");
            } catch (e) {
                console.error("Scrape error:", e);
                setStatus("Could not scrape page content.");
                setIsScraping(false);
                setIsScrapablePage(false);
            }
        })();
    }, [configReady]);

    const handleSave = async () => {
        if (!scraped) {
            setStatus("No content available.");
            return;
        }

        setIsSaving(true);
        setStatus(araReady ? "Sending to Ara for summarization..." : "Saving to Notion...");

        chrome.runtime.sendMessage(
            {
                type: "SAVE_ARTICLE",
                payload: {
                    title: title || scraped.title,
                    body: body || scraped.body,
                    url: url || scraped.url,
                    userNotes,
                },
            },
            (resp) => {
                setIsSaving(false);
                const err = chrome.runtime.lastError;
                if (err) {
                    console.error("SAVE_ARTICLE error:", err);
                    setStatus(`Failed: ${err.message}`);
                    return;
                }

                console.log("[EXT] Save response:", resp);
                if (resp?.ok) {
                    if (resp.message === "Already exists") {
                        setStatus(`Already saved: ${title}`);
                    } else {
                        setStatus("Saved ✓");
                        if (resp.summary) setResultSummary(resp.summary);
                        if (resp.category) setResultCategory(resp.category);
                    }
                } else {
                    setStatus(`Error: ${resp?.error || "Unknown"}`);
                }
            }
        );
    };

    const handleOpenSettingsPanel = () => {
        openSettingsSidePanel(setStatus);
        window.close();
    };

    const handleOpenSettings = (e: React.MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        openSettingsSidePanel(setStatus);
        window.close();
    };

    if (configReady && isScraping) {
        return (
            <div className="container">
                <h3>Save LinkedIn → Ara → Notion</h3>
                <p>Scraping LinkedIn page…</p>
            </div>
        );
    }

    if (configMissing) {
        return (
            <div className="container">
                <h3>Save LinkedIn → Ara → Notion</h3>
                <p>{status || "Notion is not configured yet."}</p>
                <button onClick={handleOpenSettingsPanel}>
                    Open settings side panel
                </button>
            </div>
        );
    }

    if (!isScrapablePage) {
        return (
            <div className="container">
                <h3>Save LinkedIn → Ara → Notion</h3>
                <p>{status || "This page doesn't look like a LinkedIn page we can scrape."}</p>
            </div>
        );
    }

    return (
        <div className="container">
            <h3>Save LinkedIn → Ara → Notion</h3>

            <label>Article Name</label>
            <input
                id="titleInput"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
            />

            <label>URL</label>
            <input
                id="urlInput"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                readOnly
            />

            <label>Your Notes</label>
            <textarea
                id="notesInput"
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                rows={4}
                placeholder="Add your personal notes here (optional)"
            />

            {!araReady && (
                <p className="hint">
                    Ara is not configured — content will be saved as-is without AI summary.
                </p>
            )}
            {araReady && (
                <p className="hint ara-ready">
                    ⚡ Ara AI will summarize &amp; categorize this article.
                </p>
            )}

            <button
                id="saveBtn"
                onClick={handleSave}
                disabled={isSaving}
            >
                {isSaving
                    ? "Processing…"
                    : araReady
                        ? "Summarize & Save"
                        : "Save to Notion"}
            </button>

            <p id="status">{status}</p>

            {resultSummary && (
                <div className="result-box">
                    <label>AI Summary</label>
                    <p className="result-text">{resultSummary}</p>
                    {resultCategory && (
                        <p className="result-category">
                            Category: <strong>{resultCategory}</strong>
                        </p>
                    )}
                </div>
            )}

            <a id="settingsLink" href="#" onClick={handleOpenSettings}>
                Settings
            </a>
        </div>
    );
}