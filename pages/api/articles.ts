import type { NextApiRequest, NextApiResponse } from "next";

export interface Article {
  id: string;
  title: string;
  source: string;
  date: string;
  url: string;
  snippet: string;
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  published_date?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { q } = req.query;
  if (!q || typeof q !== "string") {
    return res.status(400).json({ error: "Missing query parameter: q" });
  }

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "TAVILY_API_KEY is not configured" });
  }

  const tavilyRes = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query: q,
      search_depth: "basic",
      include_answer: false,
      max_results: 6,
      // Exclude video platforms — we have YouTube already
      exclude_domains: ["youtube.com", "youtu.be"],
    }),
  });

  if (!tavilyRes.ok) {
    const err = await tavilyRes.json().catch(() => ({}));
    const errMsg =
      (err as { message?: string; detail?: string }).message ??
      (err as { detail?: string }).detail ??
      `Tavily error ${tavilyRes.status}`;
    return res.status(tavilyRes.status).json({ error: errMsg });
  }

  const data = await tavilyRes.json();
  const results: TavilyResult[] = data.results ?? [];

  const articles: Article[] = results.map((r, i) => ({
    id: String(i),
    title: r.title,
    source: extractDomain(r.url),
    date: r.published_date ? formatDate(r.published_date) : "",
    url: r.url,
    snippet:
      r.content.slice(0, 160).trimEnd() + (r.content.length > 160 ? "…" : ""),
  }));

  return res.status(200).json({ articles });
}

function extractDomain(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host;
  } catch {
    return url;
  }
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}
