import type { NextApiRequest, NextApiResponse } from "next";

export interface MechanicShop {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  totalRatings: number;
  isOpen: boolean | null;
  mapsUrl: string;
}

interface ErrorResponse {
  error: string;
}

const ZIP_RE = /^\d{5}(-\d{4})?$/;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MechanicShop[] | ErrorResponse>,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { zipCode } = req.body as { zipCode?: unknown };

  if (typeof zipCode !== "string" || !ZIP_RE.test(zipCode.trim())) {
    return res
      .status(400)
      .json({ error: "A valid 5-digit US ZIP code is required." });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "Google Maps API key is not configured." });
  }

  const query = encodeURIComponent(`auto mechanic near ${zipCode.trim()}`);
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&type=car_repair&key=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    return res.status(502).json({ error: "Failed to reach Google Maps API." });
  }

  const data = (await response.json()) as {
    status: string;
    results: Array<{
      place_id: string;
      name: string;
      formatted_address: string;
      rating?: number;
      user_ratings_total?: number;
      opening_hours?: { open_now?: boolean };
    }>;
  };

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    return res
      .status(502)
      .json({ error: `Google Maps returned status: ${data.status}` });
  }

  const shops: MechanicShop[] = (data.results ?? []).slice(0, 10).map((r) => ({
    placeId: r.place_id,
    name: r.name,
    address: r.formatted_address,
    rating: r.rating ?? null,
    totalRatings: r.user_ratings_total ?? 0,
    isOpen: r.opening_hours?.open_now ?? null,
    mapsUrl: `https://www.google.com/maps/place/?q=place_id:${r.place_id}`,
  }));

  return res.status(200).json(shops);
}
