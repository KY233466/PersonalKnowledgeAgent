chrome.runtime.onInstalled.addListener(() => {
  console.log("Chrome extension installed");
});

console.log("[EXT] Background loaded");

const NOTION_VERSION = "2025-09-03";

async function getConfig() {
  const {
    linkedin_to_notion_API,
    linkedin_to_notion_database,
    ara_api_key,
    ara_app_id,
    ara_agent_id,
  } = await chrome.storage.local.get([
    "linkedin_to_notion_API",
    "linkedin_to_notion_database",
    "ara_api_key",
    "ara_app_id",
    "ara_agent_id",
  ]);

  return {
    NOTION_KEY: linkedin_to_notion_API || "",
    NOTION_DATABASE_ID: linkedin_to_notion_database || "",
    ARA_API_KEY: ara_api_key || "",
    ARA_APP_ID: ara_app_id || "",
    ARA_AGENT_ID: ara_agent_id || "",
  };
}

// --- Ara helpers ---

async function araSummarize(
    araKey: string,
    appId: string,
    agentId: string,
    payload: { title: string; body: string; url: string; userNotes: string }
): Promise<{ summary: string; category: string }> {
  const res = await fetch(`https://api.ara.so/v1/apps/${appId}/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${araKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agent_id: agentId,
      workflow_id: agentId,
      input: payload,
    }),
  });

  const txt = await res.text();
  console.log("[EXT] Ara response:", res.status, txt);
  if (!res.ok) throw new Error(`Ara API failed (${res.status}): ${txt}`);

  const parsed = JSON.parse(txt);
  const outputText: string = parsed?.result?.output_text || "";

  // Parse structured output: expect JSON block in output
  const jsonMatch = outputText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      return {
        summary: obj.summary || obj.notes || outputText,
        category: obj.category || "Uncategorized",
      };
    } catch {
      // fall through
    }
  }

  return { summary: outputText, category: "Uncategorized" };
}

// --- Notion helpers ---

async function notionQueryByUrl(
    notionKey: string,
    databaseId: string,
    url: string
) {
  const res = await fetch(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${notionKey}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filter: { property: "URL", url: { equals: url } },
          page_size: 1,
        }),
      }
  );

  const txt = await res.text();
  console.log("[EXT] Notion query:", res.status, txt);
  if (!res.ok) throw new Error(txt);
  return JSON.parse(txt);
}

async function notionCreateArticle(
    notionKey: string,
    databaseId: string,
    payload: {
      articleName: string;
      notes: string;
      url: string;
      category: string;
    }
) {
  const body = {
    parent: { database_id: databaseId },
    properties: {
      "Article Name": { title: [{ text: { content: payload.articleName } }] },
      "Notes": { rich_text: [{ text: { content: payload.notes } }] },
      "URL": { url: payload.url },
      "Category": { multi_select: [{ name: payload.category }] },
    },
  };

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notionKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const txt = await res.text();
  console.log("[EXT] Notion create:", res.status, txt);
  if (!res.ok) throw new Error(txt);
  return JSON.parse(txt);
}

// --- Message handler ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "PING_NOTION") {
        const { NOTION_KEY } = await getConfig();
        if (!NOTION_KEY) {
          sendResponse({ ok: false, error: "Missing Notion key" });
          return;
        }

        const res = await fetch("https://api.notion.com/v1/users/me", {
          headers: {
            Authorization: `Bearer ${NOTION_KEY}`,
            "Notion-Version": NOTION_VERSION,
          },
        });

        sendResponse({ ok: res.ok });
        return;
      }

      if (msg.type === "PING_ARA") {
        const { ARA_API_KEY } = await getConfig();
        sendResponse({ ok: !!ARA_API_KEY });
        return;
      }

      if (msg.type === "SAVE_ARTICLE") {
        const config = await getConfig();
        if (!config.NOTION_KEY || !config.NOTION_DATABASE_ID) {
          sendResponse({ ok: false, error: "Missing Notion credentials." });
          return;
        }

        const { title, body, url, userNotes } = msg.payload;

        // Check duplicates (non-blocking)
        try {
          const exists = await notionQueryByUrl(
              config.NOTION_KEY,
              config.NOTION_DATABASE_ID,
              url
          );
          if (exists.results.length > 0) {
            sendResponse({ ok: true, message: "Already exists" });
            return;
          }
        } catch (e: any) {
          console.warn("[EXT] Duplicate check skipped:", e.message);
        }

        let summary = userNotes || body || "";
        let category = "Uncategorized";

        // If Ara is configured, use it for summarization
        if (config.ARA_API_KEY && config.ARA_APP_ID && config.ARA_AGENT_ID) {
          try {
            const araResult = await araSummarize(
                config.ARA_API_KEY,
                config.ARA_APP_ID,
                config.ARA_AGENT_ID,
                { title, body, url, userNotes }
            );
            summary = araResult.summary;
            category = araResult.category;
          } catch (e: any) {
            console.warn("[EXT] Ara failed, using raw content:", e.message);
          }
        }

        await notionCreateArticle(
            config.NOTION_KEY,
            config.NOTION_DATABASE_ID,
            {
              articleName: title,
              notes: summary,
              url,
              category,
            }
        );

        sendResponse({ ok: true, message: "Saved", summary, category });
        return;
      }
    } catch (e: any) {
      console.error("[EXT] Background error:", e);
      sendResponse({ ok: false, error: e.message });
    }
  })();

  return true;
});