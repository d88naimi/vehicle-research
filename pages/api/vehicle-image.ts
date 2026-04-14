import type { NextApiRequest, NextApiResponse } from "next";

export interface VehicleImageResult {
  url: string;
  contextLink: string;
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

  const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_CUSTOM_SEARCH_CX;

  if (!apiKey || !cx) {
    return res
      .status(500)
      .json({ error: "Google Custom Search is not configured" });
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", q);
  url.searchParams.set("searchType", "image");
  url.searchParams.set("num", "1");
  url.searchParams.set("imgType", "photo");
  url.searchParams.set("imgSize", "xlarge");
  url.searchParams.set("safe", "active");

  const searchRes = await fetch(url.toString());
  if (!searchRes.ok) {
    const err = await searchRes.json();
    return res
      .status(searchRes.status)
      .json({ error: err.error?.message ?? "Google API error" });
  }

  const data = await searchRes.json();
  const item = data.items?.[0];

  if (!item) {
    return res.status(200).json({ image: null });
  }

  const image: VehicleImageResult = {
    url: item.link,
    contextLink: item.image?.contextLink ?? "",
  };

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
  return res.status(200).json({ image });
}
