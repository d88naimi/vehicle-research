import type { NextApiRequest, NextApiResponse } from "next";

export interface YouTubeVideo {
  id: string;
  title: string;
  channel: string;
  views: string;
  thumbnail: string;
  url: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { q } = req.query;
  if (!q || typeof q !== "string") {
    return res.status(400).json({ error: "Missing query parameter: q" });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "YOUTUBE_API_KEY is not configured" });
  }

  // Search for videos
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("q", q);
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("maxResults", "6");
  searchUrl.searchParams.set("relevanceLanguage", "en");
  searchUrl.searchParams.set("key", apiKey);

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    const err = await searchRes.json();
    return res.status(searchRes.status).json({ error: err.error?.message ?? "YouTube API error" });
  }

  const searchData = await searchRes.json();
  const items: { id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails: { medium: { url: string } } } }[] = searchData.items ?? [];

  if (items.length === 0) {
    return res.status(200).json({ videos: [] });
  }

  // Fetch view counts in one batch request
  const videoIds = items.map((item) => item.id.videoId).join(",");
  const statsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  statsUrl.searchParams.set("part", "statistics");
  statsUrl.searchParams.set("id", videoIds);
  statsUrl.searchParams.set("key", apiKey);

  const statsRes = await fetch(statsUrl.toString());
  const statsData = statsRes.ok ? await statsRes.json() : { items: [] };
  const statsMap: Record<string, string> = {};
  for (const item of statsData.items ?? []) {
    const count = parseInt(item.statistics?.viewCount ?? "0", 10);
    statsMap[item.id] = formatViews(count);
  }

  const videos: YouTubeVideo[] = items.map((item) => ({
    id: item.id.videoId,
    title: item.snippet.title,
    channel: item.snippet.channelTitle,
    views: statsMap[item.id.videoId] ?? "",
    thumbnail: item.snippet.thumbnails.medium.url,
    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
  }));

  return res.status(200).json({ videos });
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K views`;
  return `${n} views`;
}
