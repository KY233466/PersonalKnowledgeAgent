import { useEffect, useState } from "react";
import "./SidePanel.css";

export default function SidePanel() {
    const [apiKey, setApiKey] = useState("");
    const [dbId, setDbId] = useState("");
    const [araKey, setAraKey] = useState("");
    const [araAppId, setAraAppId] = useState("");
    const [araAgentId, setAraAgentId] = useState("");
    const [loaded, setLoaded] = useState(false);
    const [saved, setSaved] = useState(false);
    const [showApi, setShowApi] = useState(false);
    const [showDb, setShowDb] = useState(false);
    const [showAraKey, setShowAraKey] = useState(false);
    const [showConfirmClear, setShowConfirmClear] = useState(false);
    const [cleared, setCleared] = useState(false);

    useEffect(() => {
        chrome.storage.local.get(
            [
                "linkedin_to_notion_API",
                "linkedin_to_notion_database",
                "ara_api_key",
                "ara_app_id",
                "ara_agent_id",
            ],
            (res) => {
                if (res.linkedin_to_notion_API) setApiKey(res.linkedin_to_notion_API);
                if (res.linkedin_to_notion_database) setDbId(res.linkedin_to_notion_database);
                if (res.ara_api_key) setAraKey(res.ara_api_key);
                if (res.ara_app_id) setAraAppId(res.ara_app_id);
                if (res.ara_agent_id) setAraAgentId(res.ara_agent_id);
                setLoaded(true);
            }
        );
    }, []);

    async function saveSettings() {
        await chrome.storage.local.set({
            linkedin_to_notion_API: apiKey,
            linkedin_to_notion_database: dbId,
            ara_api_key: araKey,
            ara_app_id: araAppId,
            ara_agent_id: araAgentId,
        });
        setSaved(true);

        await new Promise((resolve) => setTimeout(resolve, 1000));

        try {
            if (chrome.action && chrome.action.openPopup) {
                chrome.action.openPopup(() => {
                    window.close();
                });
            } else {
                window.close();
            }
        } catch (e) {
            console.error("Failed to open popup from side panel:", e);
            window.close();
        }
    }

    async function handleConfirmClear() {
        await chrome.storage.local.remove([
            "linkedin_to_notion_API",
            "linkedin_to_notion_database",
            "ara_api_key",
            "ara_app_id",
            "ara_agent_id",
        ]);
        setApiKey("");
        setDbId("");
        setAraKey("");
        setAraAppId("");
        setAraAgentId("");
        setSaved(false);
        setCleared(true);
        setShowConfirmClear(false);
        setTimeout(() => setCleared(false), 1500);
    }

    if (!loaded) return <div className="sp-container">Loading…</div>;

    return (
        <div className="sp-container">
            <div>
                <h2>Settings</h2>
                <p className="note">
                    Credentials stay <strong>local</strong> only in your chrome.storage.
                </p>

                <h3 className="sp-section-title">Notion</h3>

                <label>Notion API Key</label>
                <div className="sp-field-row">
                    <input
                        type={showApi ? "text" : "password"}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Paste your Internal Integration Token"
                    />
                    <button
                        type="button"
                        className="sp-toggle-visibility"
                        onClick={() => setShowApi((prev) => !prev)}
                        aria-label={showApi ? "Hide API key" : "Show API key"}
                    >
                        {showApi ? "🙈" : "👁"}
                    </button>
                </div>

                <label>Notion Database ID</label>
                <div className="sp-field-row">
                    <input
                        type={showDb ? "text" : "password"}
                        value={dbId}
                        onChange={(e) => setDbId(e.target.value)}
                        placeholder="Paste your Database ID"
                    />
                    <button
                        type="button"
                        className="sp-toggle-visibility"
                        onClick={() => setShowDb((prev) => !prev)}
                        aria-label={showDb ? "Hide database ID" : "Show database ID"}
                    >
                        {showDb ? "🙈" : "👁"}
                    </button>
                </div>

                <h3 className="sp-section-title">Ara AI (Optional)</h3>
                <p className="note">
                    Connect your Ara agent to auto-summarize and categorize articles.
                </p>

                <label>Ara Runtime Key</label>
                <div className="sp-field-row">
                    <input
                        type={showAraKey ? "text" : "password"}
                        value={araKey}
                        onChange={(e) => setAraKey(e.target.value)}
                        placeholder="ak_app_..."
                    />
                    <button
                        type="button"
                        className="sp-toggle-visibility"
                        onClick={() => setShowAraKey((prev) => !prev)}
                        aria-label={showAraKey ? "Hide Ara key" : "Show Ara key"}
                    >
                        {showAraKey ? "🙈" : "👁"}
                    </button>
                </div>

                <label>Ara App ID</label>
                <div className="sp-field-row">
                    <input
                        type="text"
                        value={araAppId}
                        onChange={(e) => setAraAppId(e.target.value)}
                        placeholder="app_..."
                    />
                </div>

                <label>Ara Agent ID</label>
                <div className="sp-field-row">
                    <input
                        type="text"
                        value={araAgentId}
                        onChange={(e) => setAraAgentId(e.target.value)}
                        placeholder="e.g. linkedin-summarizer"
                    />
                </div>

                <button onClick={saveSettings}>Save</button>

                {saved && <p className="saved">Saved ✓</p>}
                {cleared && <p className="cleared">Credentials cleared ✓</p>}
            </div>

            <div>
              { (apiKey || dbId || araKey) && showConfirmClear && (
                  <div className="sp-modal-backdrop">
                    <div className="sp-modal">
                      <p>Are you sure you want to clear all stored credentials?</p>
                      <div className="sp-field-row">
                        <button
                          type="button"
                          className="sp-modal-confirm"
                          onClick={handleConfirmClear}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          className="sp-modal-cancel"
                          onClick={() => setShowConfirmClear(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )
              }

              { (apiKey || dbId || araKey) && (
                <button
                  type="button"
                  className="sp-clear"
                  onClick={() => {
                    setShowConfirmClear(true);
                  }}
                >
                  Clear All Credentials
                </button>
              )}
            </div>
        </div>
    );
}