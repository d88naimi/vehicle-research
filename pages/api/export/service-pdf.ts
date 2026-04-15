import type { NextApiRequest, NextApiResponse } from "next";
import puppeteer from "puppeteer";

export const config = {
  maxDuration: 60,
};

interface ServiceItem {
  id: string;
  service: string;
  diagnosis: string;
  laborHours: number;
  partsCost: number;
  priority: "urgent" | "recommended" | "optional";
}

interface ServiceReport {
  summary: string;
  items: ServiceItem[];
  notes: string;
}

interface Vehicle {
  make: string;
  model: string;
  year: number;
}

const PRIORITY_STYLES: Record<string, { bg: string; border: string; badge: string; text: string; label: string }> = {
  urgent: {
    bg: "#fff5f5",
    border: "#fecaca",
    badge: "#fee2e2",
    text: "#b91c1c",
    label: "Urgent",
  },
  recommended: {
    bg: "#fefce8",
    border: "#fde68a",
    badge: "#fef3c7",
    text: "#92400e",
    label: "Recommended",
  },
  optional: {
    bg: "#f9fafb",
    border: "#e5e7eb",
    badge: "#f3f4f6",
    text: "#374151",
    label: "Optional",
  },
};

function buildHTML(
  vehicle: Vehicle,
  report: ServiceReport,
  laborRate: number,
): string {
  const totalLabor = report.items.reduce(
    (sum, item) => sum + item.laborHours * laborRate,
    0,
  );
  const totalParts = report.items.reduce((sum, item) => sum + item.partsCost, 0);
  const grandTotal = totalLabor + totalParts;

  const itemRows = report.items
    .map((item) => {
      const s = PRIORITY_STYLES[item.priority] ?? PRIORITY_STYLES.optional;
      const itemTotal = item.laborHours * laborRate + item.partsCost;
      return `
      <div style="border:1px solid ${s.border}; background:${s.bg}; border-radius:8px; padding:14px 16px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px;">
          <div style="flex:1;">
            <span style="display:inline-block; background:${s.badge}; color:${s.text}; font-size:11px; font-weight:600; padding:2px 8px; border-radius:999px; margin-bottom:6px;">
              ${s.label}
            </span>
            <div style="font-weight:600; font-size:13px; color:#111827; margin-bottom:3px;">${escapeHtml(item.service)}</div>
            <div style="font-size:12px; color:#6b7280;">${escapeHtml(item.diagnosis)}</div>
          </div>
          <div style="text-align:right; white-space:nowrap;">
            <div style="font-weight:700; font-size:14px; color:#111827;">$${itemTotal.toFixed(2)}</div>
            <div style="font-size:11px; color:#9ca3af; margin-top:2px;">${item.laborHours}h labor + $${item.partsCost} parts</div>
          </div>
        </div>
      </div>`;
    })
    .join("");

  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Service Quote — ${vehicle.year} ${vehicle.make} ${vehicle.model}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      color: #111827;
      background: #ffffff;
      padding: 40px 48px;
      font-size: 13px;
      line-height: 1.5;
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; padding-bottom:20px; border-bottom:2px solid #e5e7eb;">
    <div>
      <div style="font-size:22px; font-weight:800; color:#111827; letter-spacing:-0.5px;">VehicleIQ</div>
      <div style="font-size:11px; color:#9ca3af; margin-top:2px;">AI-Powered Service Advisor</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:18px; font-weight:700; color:#111827;">Service Quote</div>
      <div style="font-size:13px; color:#6b7280; margin-top:2px;">${vehicle.year} ${escapeHtml(vehicle.make)} ${escapeHtml(vehicle.model)}</div>
      <div style="font-size:11px; color:#9ca3af; margin-top:2px;">Prepared ${date}</div>
    </div>
  </div>

  <!-- AI Summary -->
  <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:14px 16px; margin-bottom:24px; font-size:13px; color:#374151; line-height:1.6;">
    ${escapeHtml(report.summary)}
  </div>

  <!-- Service items -->
  <div style="margin-bottom:16px; font-size:11px; font-weight:600; color:#9ca3af; text-transform:uppercase; letter-spacing:0.05em;">
    Recommended Services
  </div>
  ${itemRows}

  <!-- Totals -->
  <div style="border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-top:20px; background:#fff;">
    <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:12px; color:#6b7280;">
      <span>Labor rate</span>
      <span>$${laborRate}/hr</span>
    </div>
    <div style="border-top:1px solid #e5e7eb; padding-top:10px;">
      <div style="display:flex; justify-content:space-between; font-size:12px; color:#6b7280; margin-bottom:5px;">
        <span>Labor subtotal</span>
        <span>$${totalLabor.toFixed(2)}</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:12px; color:#6b7280; margin-bottom:10px;">
        <span>Parts subtotal</span>
        <span>$${totalParts.toFixed(2)}</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:16px; font-weight:700; color:#111827; border-top:1px solid #e5e7eb; padding-top:10px;">
        <span>Estimated Total</span>
        <span>$${grandTotal.toFixed(2)}</span>
      </div>
    </div>
  </div>

  <!-- Notes -->
  ${
    report.notes
      ? `<div style="margin-top:16px; font-size:11px; color:#9ca3af; border:1px solid #e5e7eb; border-radius:8px; padding:10px 14px; background:#f9fafb; line-height:1.6;">
      ${escapeHtml(report.notes)}
    </div>`
      : ""
  }

  <!-- Footer -->
  <div style="margin-top:32px; padding-top:16px; border-top:1px solid #e5e7eb; font-size:10px; color:#d1d5db; text-align:center;">
    This estimate is generated by AI and is for informational purposes only. Actual costs may vary. Always consult a qualified mechanic before authorizing repairs.
  </div>

</body>
</html>`;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { vehicle, report, laborRate } = req.body as {
    vehicle: Vehicle;
    report: ServiceReport;
    laborRate: number;
  };

  if (!vehicle || !report || !Array.isArray(report.items)) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const safeRate = Math.max(50, Math.min(500, Number(laborRate) || 150));
  const html = buildHTML(vehicle, report, safeRate);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
    });

    const filename = `service-quote-${vehicle.year}-${vehicle.make}-${vehicle.model}`
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.pdf"`);
    res.send(Buffer.from(pdf));
  } catch (err) {
    console.error("Service PDF export error:", err);
    res.status(500).json({ error: "Failed to generate PDF" });
  } finally {
    await browser?.close();
  }
}
