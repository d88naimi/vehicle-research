import type { NextApiRequest, NextApiResponse } from "next";

// Popular makes to search across when query looks like a model name (e.g. "Camry", "Civic")
const POPULAR_MAKES = [
  "Toyota", "Honda", "Ford", "Chevrolet", "Tesla", "BMW", "Mercedes-Benz",
  "Audi", "Volkswagen", "Hyundai", "Kia", "Subaru", "Mazda", "Nissan",
  "Jeep", "Ram", "GMC", "Cadillac", "Lexus", "Acura", "Infiniti", "Volvo",
  "Porsche", "Land Rover", "Jaguar", "Genesis", "Rivian", "Lucid", "Polestar",
  "Lincoln", "Buick", "Dodge", "Mitsubishi", "Alfa Romeo", "Maserati",
];

// Map of make aliases → canonical NHTSA make name
const MAKE_ALIASES: Record<string, string> = {
  chevy: "Chevrolet",
  vw: "Volkswagen",
  merc: "Mercedes-Benz",
  mercedes: "Mercedes-Benz",
  "land rover": "Land Rover",
  landrover: "Land Rover",
};

// In-memory cache: "Make-Year" → NHTSA results
const modelCache = new Map<string, NhtsaModel[]>();

interface NhtsaModel {
  Make_ID: number;
  Make_Name: string;
  Model_ID: number;
  Model_Name: string;
}

interface VehicleResult {
  id: string;
  make: string;
  model: string;
  year: number;
  category: string;
}

async function fetchModelsForMakeYear(
  make: string,
  year: number
): Promise<NhtsaModel[]> {
  const key = `${make.toLowerCase()}-${year}`;
  if (modelCache.has(key)) return modelCache.get(key)!;

  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json();
    const results: NhtsaModel[] = data.Results ?? [];
    modelCache.set(key, results);
    return results;
  } catch {
    return [];
  }
}

function toVehicleResult(item: NhtsaModel, year: number): VehicleResult {
  const makeSlug = item.Make_Name.toLowerCase().replace(/[\s/]+/g, "-");
  const modelSlug = item.Model_Name.toLowerCase().replace(/[\s/]+/g, "-");
  return {
    id: `${makeSlug}-${modelSlug}-${year}`,
    make: item.Make_Name,
    model: item.Model_Name,
    year,
    category: "Vehicle",
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") return res.status(405).end();

  const { q } = req.query;
  if (!q || typeof q !== "string" || q.trim().length < 2) {
    return res.json([]);
  }

  const raw = q.trim();

  // Extract year (e.g. "2024 Toyota Camry" or "Toyota Camry 2022")
  const yearMatch = raw.match(/\b(20\d{2}|19[89]\d)\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
  const withoutYear = raw.replace(yearMatch?.[0] ?? "", "").trim().toLowerCase();

  // Resolve make alias (e.g. "chevy" → "Chevrolet")
  const resolved = MAKE_ALIASES[withoutYear] ?? null;

  // Find makes that start with the query (e.g. "toy" → Toyota)
  const makeMatches = resolved
    ? [resolved]
    : POPULAR_MAKES.filter((m) =>
        m.toLowerCase().startsWith(withoutYear) ||
        withoutYear.startsWith(m.toLowerCase())
      );

  let results: VehicleResult[] = [];

  if (makeMatches.length > 0) {
    // Query NHTSA for each matching make
    const lists = await Promise.all(
      makeMatches.slice(0, 4).map((make) => fetchModelsForMakeYear(make, year))
    );
    results = lists.flat().map((item) => toVehicleResult(item, year));
  } else if (withoutYear.length >= 2) {
    // No make match — treat the query as a model name fragment.
    // Search all popular makes for the current year first.
    const effectiveYear = yearMatch ? year : new Date().getFullYear();
    const lists = await Promise.all(
      POPULAR_MAKES.map((make) => fetchModelsForMakeYear(make, effectiveYear))
    );
    results = lists
      .flat()
      .filter((item) => item.Model_Name.toLowerCase().includes(withoutYear))
      .map((item) => toVehicleResult(item, effectiveYear));

    // If no results and no year was specified, try historical years for discontinued models
    if (results.length === 0 && !yearMatch) {
      const historicalYears = [2020, 2015, 2010, 2005, 2000];
      for (const hy of historicalYears) {
        const hLists = await Promise.all(
          POPULAR_MAKES.map((make) => fetchModelsForMakeYear(make, hy))
        );
        const hResults = hLists
          .flat()
          .filter((item) => item.Model_Name.toLowerCase().includes(withoutYear))
          .map((item) => toVehicleResult(item, hy));
        if (hResults.length > 0) {
          results = hResults;
          break;
        }
      }
    }
  }

  // Deduplicate by id and return top 12
  const seen = new Set<string>();
  const deduped = results.filter((v) => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    return true;
  });

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
  res.json(deduped.slice(0, 12));
}
