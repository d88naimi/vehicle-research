import type { NextApiRequest, NextApiResponse } from "next";

// Same make list as search.ts — used to parse vehicle ID slugs
const MAKES_BY_SLUG: Record<string, string> = {
  "alfa-romeo": "Alfa Romeo",
  "land-rover": "Land Rover",
  "mercedes-benz": "Mercedes-Benz",
  acura: "Acura",
  audi: "Audi",
  bmw: "BMW",
  buick: "Buick",
  cadillac: "Cadillac",
  chevrolet: "Chevrolet",
  dodge: "Dodge",
  ford: "Ford",
  genesis: "Genesis",
  gmc: "GMC",
  honda: "Honda",
  hyundai: "Hyundai",
  infiniti: "Infiniti",
  jaguar: "Jaguar",
  jeep: "Jeep",
  kia: "Kia",
  lexus: "Lexus",
  lincoln: "Lincoln",
  lucid: "Lucid",
  maserati: "Maserati",
  mazda: "Mazda",
  mitsubishi: "Mitsubishi",
  nissan: "Nissan",
  polestar: "Polestar",
  porsche: "Porsche",
  ram: "Ram",
  rivian: "Rivian",
  subaru: "Subaru",
  tesla: "Tesla",
  toyota: "Toyota",
  volkswagen: "Volkswagen",
  volvo: "Volvo",
};

// Sorted longest-first so "land-rover" matches before "land"
const MAKE_SLUGS_SORTED = Object.keys(MAKES_BY_SLUG).sort(
  (a, b) => b.length - a.length
);

interface NhtsaModel {
  Make_Name: string;
  Model_Name: string;
}

async function fetchModelsForMakeYear(
  make: string,
  year: number
): Promise<NhtsaModel[]> {
  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json();
    return data.Results ?? [];
  } catch {
    return [];
  }
}

function parseVehicleId(
  id: string
): { make: string; modelSlug: string; year: number } | null {
  // Standard format: {make-slug}-{model-slug}-{year}  e.g. "acura-integra-2026"
  const yearMatch = id.match(/-(\d{4})$/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]);
    const withoutYear = id.slice(0, id.length - yearMatch[0].length);

    for (const makeSlug of MAKE_SLUGS_SORTED) {
      if (withoutYear === makeSlug || withoutYear.startsWith(makeSlug + "-")) {
        const make = MAKES_BY_SLUG[makeSlug];
        const modelSlug = withoutYear.slice(makeSlug.length + 1);
        return { make, modelSlug, year };
      }
    }

    // No recognized make prefix — treat the whole non-year part as the model slug.
    // resolveModelName will query vPIC across all makes to find the canonical name.
    if (withoutYear.length > 0) {
      return { make: "", modelSlug: withoutYear, year };
    }
  }

  // Year-first format: {year}-{model-slug}  e.g. "2026-integra"
  const yearFirstMatch = id.match(/^(\d{4})-(.+)$/);
  if (yearFirstMatch) {
    const year = parseInt(yearFirstMatch[1]);
    const modelSlug = yearFirstMatch[2];
    return { make: "", modelSlug, year };
  }

  return null;
}

// Find the canonical NHTSA model name by matching the slug against vPIC results.
// Stripping all separators handles cases like "f150" → "F-150", "model3" → "Model 3".
async function resolveModelName(
  make: string,
  modelSlug: string,
  year: number
): Promise<string> {
  const models = await fetchModelsForMakeYear(make, year);
  const target = modelSlug.replace(/-/g, "").toLowerCase();
  // 1. Exact normalized match (e.g. "rsx" === "rsx")
  for (const m of models) {
    const normalized = m.Model_Name.replace(/[\s\-\/]/g, "").toLowerCase();
    if (normalized === target) return m.Model_Name;
  }
  // 2. Prefix match (e.g. "rsx" matches "RSX Type-S")
  for (const m of models) {
    const normalized = m.Model_Name.replace(/[\s\-\/]/g, "").toLowerCase();
    if (normalized.startsWith(target)) return m.Model_Name;
  }
  // Fallback: title-case each dash-separated word
  return modelSlug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Extract a single field from EPA XML (no external parser needed)
function xmlField(xml: string, field: string): string {
  const m = xml.match(new RegExp(`<${field}>([^<]*)</${field}>`));
  return m?.[1]?.trim() ?? "";
}

interface EpaData {
  city: string;
  highway: string;
  cylinders: string;
  displacement: string;
  drive: string;
  fuelType: string;
  transmission: string;
  bodyClass: string;
}

// Normalize a model name for fuzzy matching (strips spaces, dashes, slashes)
function normModel(s: string) {
  return s.replace(/[\s\-\/]/g, "").toLowerCase();
}

// Resolve an EPA model name from the make/year model list when an exact query returns nothing.
// Tries: 1) exact normalized match, 2) EPA model starts with our target slug.
async function resolveEpaModel(
  make: string,
  model: string,
  year: number
): Promise<string | null> {
  const listUrl = `https://www.fueleconomy.gov/ws/rest/vehicle/menu/model?year=${year}&make=${encodeURIComponent(make)}`;
  const listRes = await fetch(listUrl, { signal: AbortSignal.timeout(8000) });
  if (!listRes.ok) return null;
  const listXml = await listRes.text();
  const epaModels = [...listXml.matchAll(/<text>([^<]+)<\/text>/g)].map(
    (m) => m[1]
  );
  const target = normModel(model);
  const exact = epaModels.find((m) => normModel(m) === target);
  if (exact) return exact;
  // Prefix match: our slug is a prefix of the EPA model (e.g. "f150" matches "F150 Pickup 2WD")
  return epaModels.find((m) => normModel(m).startsWith(target)) ?? null;
}

async function fetchEpaData(
  make: string,
  model: string,
  year: number
): Promise<EpaData | null> {
  try {
    // First try exact model name (works for Camry, Outback, etc.)
    let optionsXml: string;
    const directRes = await fetch(
      `https://www.fueleconomy.gov/ws/rest/vehicle/menu/options?year=${year}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!directRes.ok) return null;
    optionsXml = await directRes.text();

    // If direct query returns nothing, look up the model list and try a prefix match
    if (!optionsXml.includes("<value>")) {
      const epaModel = await resolveEpaModel(make, model, year);
      if (!epaModel) return null;
      const fallbackRes = await fetch(
        `https://www.fueleconomy.gov/ws/rest/vehicle/menu/options?year=${year}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(epaModel)}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!fallbackRes.ok) return null;
      optionsXml = await fallbackRes.text();
    }

    const vehicleId = optionsXml.match(/<value>(\d+)<\/value>/)?.[1];
    if (!vehicleId) return null;

    const vehicleRes = await fetch(
      `https://www.fueleconomy.gov/ws/rest/vehicle/${vehicleId}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!vehicleRes.ok) return null;
    const xml = await vehicleRes.text();

    return {
      city: xmlField(xml, "city08"),
      highway: xmlField(xml, "highway08"),
      cylinders: xmlField(xml, "cylinders"),
      displacement: xmlField(xml, "displ"),
      drive: xmlField(xml, "drive"),
      fuelType: xmlField(xml, "fuelType1"),
      transmission: xmlField(xml, "trany"),
      bodyClass: xmlField(xml, "VClass"),
    };
  } catch {
    return null;
  }
}

interface NhtsaRatings {
  OverallRating: string;
  FrontCrashRating: string;
  SideCrashRating: string;
  RolloverRating: string;
}

async function fetchNhtsaRatings(
  make: string,
  model: string,
  year: number
): Promise<NhtsaRatings | null> {
  try {
    const variantsUrl = `https://api.nhtsa.dot.gov/SafetyRatings/modelyear/${year}/make/${encodeURIComponent(make)}/model/${encodeURIComponent(model)}`;
    const variantsRes = await fetch(variantsUrl, {
      signal: AbortSignal.timeout(8000),
    });
    if (!variantsRes.ok) return null;
    const variantsData = await variantsRes.json();
    let variants: Array<{ VehicleId: number }> = variantsData.Results ?? [];

    // If no exact match, try fetching all NHTSA models for the make+year and
    // pick any whose name starts with our model slug (handles "RSX" → "RSX Type S" etc.)
    if (variants.length === 0) {
      const allMakeUrl = `https://api.nhtsa.dot.gov/SafetyRatings/modelyear/${year}/make/${encodeURIComponent(make)}`;
      const allMakeRes = await fetch(allMakeUrl, {
        signal: AbortSignal.timeout(8000),
      });
      if (allMakeRes.ok) {
        const allMakeData = await allMakeRes.json();
        const allModels: Array<{ VehicleId: number; Model: string }> =
          allMakeData.Results ?? [];
        const target = model.replace(/[\s\-\/]/g, "").toLowerCase();
        const match = allModels.find((m) =>
          m.Model.replace(/[\s\-\/]/g, "").toLowerCase().startsWith(target)
        );
        if (match) variants = [match];
      }
    }

    if (variants.length === 0) return null;

    const ratingsRes = await fetch(
      `https://api.nhtsa.dot.gov/SafetyRatings/VehicleId/${variants[0].VehicleId}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!ratingsRes.ok) return null;
    const ratingsData = await ratingsRes.json();
    return ratingsData.Results?.[0] ?? null;
  } catch {
    return null;
  }
}

// Same popular makes list used in search.ts — for model-name-only slug resolution
const POPULAR_MAKES_LIST = [
  "Toyota", "Honda", "Ford", "Chevrolet", "Tesla", "BMW", "Mercedes-Benz",
  "Audi", "Volkswagen", "Hyundai", "Kia", "Subaru", "Mazda", "Nissan",
  "Jeep", "Ram", "GMC", "Cadillac", "Lexus", "Acura", "Infiniti", "Volvo",
  "Porsche", "Land Rover", "Jaguar", "Genesis", "Rivian", "Lucid", "Polestar",
  "Lincoln", "Buick", "Dodge", "Mitsubishi", "Alfa Romeo", "Maserati",
];

// When the parsed slug has no recognized make, search vPIC across all popular makes.
// Returns { make, model } if found, or null.
async function resolveMakeAndModel(
  modelSlug: string,
  year: number
): Promise<{ make: string; model: string } | null> {
  const target = modelSlug.replace(/-/g, "").toLowerCase();
  const lists = await Promise.all(
    POPULAR_MAKES_LIST.map(async (make) => {
      const models = await fetchModelsForMakeYear(make, year);
      return models.map((m) => ({ make, model: m.Model_Name }));
    })
  );
  for (const list of lists) {
    for (const item of list) {
      const normalized = item.model.replace(/[\s\-\/]/g, "").toLowerCase();
      if (normalized === target || normalized.startsWith(target)) {
        return item;
      }
    }
  }
  return null;
}

export interface VehicleSpecData {
  engine: string;
  drivetrain: string;
  transmission: string;
  mpg: string;
  bodyClass: string;
  overallSafety: string;
  frontCrash: string;
  sideCrash: string;
  rollover: string;
}

function stars(rating: string): string {
  const n = parseInt(rating);
  if (!n) return "—";
  return "★".repeat(n) + "☆".repeat(5 - n) + `  ${n}/5`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") return res.status(405).end();

  const { vehicles } = req.query;
  if (!vehicles || typeof vehicles !== "string") return res.json({});

  const vehicleIds = vehicles.split(",").filter(Boolean).slice(0, 3);
  const result: Record<string, VehicleSpecData> = {};

  await Promise.all(
    vehicleIds.map(async (id) => {
      const parsed = parseVehicleId(id);
      if (!parsed) return;

      let make = parsed.make;
      let modelName: string;

      if (!make) {
        // No recognized make in slug — search vPIC to find the real make + model
        const resolved = await resolveMakeAndModel(parsed.modelSlug, parsed.year);
        if (!resolved) return;
        make = resolved.make;
        modelName = resolved.model;
      } else {
        modelName = await resolveModelName(make, parsed.modelSlug, parsed.year);
      }

      const [epa, nhtsa] = await Promise.all([
        fetchEpaData(make, modelName, parsed.year),
        fetchNhtsaRatings(make, modelName, parsed.year),
      ]);

      const engineParts = [
        epa?.displacement && epa?.cylinders
          ? `${epa.displacement}L ${epa.cylinders}-cyl`
          : "",
        epa?.fuelType ?? "",
      ].filter(Boolean);

      result[id] = {
        engine: engineParts.join(", ") || "—",
        drivetrain: epa?.drive || "—",
        transmission: epa?.transmission || "—",
        mpg:
          epa?.city && epa?.highway
            ? `${epa.city} city / ${epa.highway} hwy`
            : "—",
        bodyClass: epa?.bodyClass || "—",
        overallSafety: stars(nhtsa?.OverallRating ?? ""),
        frontCrash: stars(nhtsa?.FrontCrashRating ?? ""),
        sideCrash: stars(nhtsa?.SideCrashRating ?? ""),
        rollover: stars(nhtsa?.RolloverRating ?? ""),
      };
    })
  );

  // Cache for 24 h — specs don't change often
  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate");
  res.json(result);
}
