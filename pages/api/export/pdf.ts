import type { NextApiRequest, NextApiResponse } from "next";
import puppeteer from "puppeteer";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { vehicles } = req.query;
  if (!vehicles || typeof vehicles !== "string") {
    return res.status(400).json({ error: "Missing vehicles query param" });
  }

  // Derive the base URL: prefer an explicit env var (set in Vercel dashboard),
  // then fall back to the request headers. The header-based fallback is only
  // used in local dev — in production APP_URL should always be set.
  const protocol = req.headers["x-forwarded-proto"] ?? "http";
  const host =
    req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost:3000";
  const baseUrl = process.env.APP_URL ?? `${protocol}://${host}`;

  const targetUrl = `${baseUrl}/compare?vehicles=${encodeURIComponent(vehicles)}&print=1`;

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    await page.goto(targetUrl, { waitUntil: "networkidle0", timeout: 30000 });

    // Wait for the comparison table to be rendered
    await page
      .waitForSelector("table, [data-compare-table]", { timeout: 10000 })
      .catch(() => {});

    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "12mm", right: "12mm" },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="vehicle-comparison-${vehicles.replace(/,/g, "-")}.pdf"`,
    );
    res.send(Buffer.from(pdf));
  } catch (err) {
    console.error("PDF export error:", err);
    res.status(500).json({ error: "Failed to generate PDF" });
  } finally {
    await browser?.close();
  }
}
