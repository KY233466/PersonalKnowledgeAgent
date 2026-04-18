import ara_sdk as ara


@ara.tool
def summarize_article(title: str, body: str, url: str, userNotes: str) -> dict:
    """
    Return structured JSON for the article.
    The agent handles summarization via system instructions.
    This tool just echoes the raw input so the agent can work with it.
    """
    return {
        "title": title,
        "body": body[:3000],
        "url": url,
        "userNotes": userNotes,
    }


ara.Automation(
    "linkedin-summarizer",
    system_instructions=(
        "You are a professional content analyst. "
        "When you receive article data via input, do the following:\n"
        "1. Read the title, body, and any user notes.\n"
        "2. Write a concise summary (2-4 sentences) of the article content. "
        "If the user added personal notes, incorporate their perspective.\n"
        "3. Assign exactly one category from: "
        "Technology, Business, Career, Marketing, Design, Engineering, Science, Other.\n"
        "4. Return your answer as a JSON object with keys: summary, category.\n"
        "Example: {\"summary\": \"...\", \"category\": \"Technology\"}\n"
        "Do NOT include any text outside the JSON block."
    ),
    tools=[summarize_article],
)
