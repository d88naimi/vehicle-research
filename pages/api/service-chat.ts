import Anthropic from "@anthropic-ai/sdk";
import type { NextApiRequest, NextApiResponse } from "next";

export const config = {
  maxDuration: 60,
};

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a master automotive technician with 20+ years of experience diagnosing and repairing all makes and models. A customer is describing symptoms with their vehicle.

Your job is to:
1. Diagnose the most likely causes based on the symptoms and the specific vehicle
2. Recommend the exact services needed to fix the problem
3. Provide realistic flat-rate labor hours and retail parts cost estimates

You MUST respond with ONLY a valid JSON object — no explanation text, no markdown, no code fences. The JSON must match this exact structure:

{
  "summary": "Plain English 2-3 sentence explanation of the diagnosis written directly to the customer",
  "items": [
    {
      "id": "unique-kebab-case-id",
      "service": "Specific service name (e.g. Brake pad replacement - front axle)",
      "diagnosis": "Brief technical explanation of why this service is needed",
      "laborHours": 1.5,
      "partsCost": 85,
      "priority": "urgent"
    }
  ],
  "notes": "Any important caveats, disclaimers, or next-step recommendations for the customer"
}

Rules:
- priority must be exactly one of: "urgent", "recommended", or "optional"
- urgent = immediate safety or drivability issue
- recommended = should be addressed within the next few weeks
- optional = maintenance item or nice-to-have improvement
- Include 2-5 items ordered by priority (urgent first)
- laborHours must be a realistic flat-rate number between 0.3 and 8.0
- partsCost must be realistic retail parts cost in USD (number, no dollar sign)
- Be specific to the vehicle year/make/model — account for known issues or design quirks of that vehicle
- If symptoms suggest multiple possible causes, list the most likely services for each`;

export interface ServiceItem {
  id: string;
  service: string;
  diagnosis: string;
  laborHours: number;
  partsCost: number;
  priority: "urgent" | "recommended" | "optional";
}

export interface ServiceReport {
  summary: string;
  items: ServiceItem[];
  notes: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ServiceReport | { error: string }>,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { year, make, model, symptoms } = req.body as {
    year: number;
    make: string;
    model: string;
    symptoms: string;
  };

  if (!year || !make || !model || !symptoms?.trim()) {
    return res.status(400).json({ error: "year, make, model, and symptoms are required" });
  }

  const safeSymptoms = String(symptoms).slice(0, 1000);

  try {
    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Vehicle: ${year} ${make} ${model}\nCustomer complaint: ${safeSymptoms}`,
        },
      ],
    });

    const rawText =
      message.content[0].type === "text" ? message.content[0].text.trim() : "";

    let report: ServiceReport;

    try {
      // Claude should return raw JSON, but handle code-fenced JSON just in case
      const jsonText = rawText.startsWith("{")
        ? rawText
        : (rawText.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? rawText);
      report = JSON.parse(jsonText);
    } catch {
      return res.status(500).json({ error: "AI returned an unexpected format. Please try again." });
    }

    // Validate and normalise the shape
    if (!report.summary || !Array.isArray(report.items)) {
      return res.status(500).json({ error: "AI response was missing required fields." });
    }

    const validPriorities = new Set(["urgent", "recommended", "optional"]);
    report.items = report.items.map((item, i) => ({
      id: item.id || `item-${i}`,
      service: String(item.service ?? "Service"),
      diagnosis: String(item.diagnosis ?? ""),
      laborHours: Math.max(0.1, Math.min(10, Number(item.laborHours) || 1)),
      partsCost: Math.max(0, Number(item.partsCost) || 0),
      priority: validPriorities.has(item.priority) ? item.priority : "recommended",
    }));

    res.json(report);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
}
