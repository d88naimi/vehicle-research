# VehicleIQ — Vehicle Research & Comparison Tool

AI-powered vehicle research app. Users search for vehicles, read AI-curated YouTube reviews and articles, compare up to 3 vehicles side-by-side, and export results as PDFs or slide decks.

## Stack

- **Framework**: Next.js 15, Pages Router, TypeScript
- **Styling**: Tailwind CSS v4 + shadcn/ui (components in `components/ui/`)
- **AI**: Anthropic SDK (`claude-opus-4-6`) with SSE streaming and prompt caching
- **Icons**: Lucide React

## Project Structure

```
pages/
  index.tsx           — Search/landing page, vehicle cards, compare selector
  compare.tsx         — Side-by-side spec table + AI chat panel
  vehicle/[id].tsx    — Single vehicle: YouTube reviews, articles, AI chat
  api/
    chat.ts           — Streaming Anthropic API route (SSE)

components/ui/        — shadcn/ui primitives (button, card, input, badge, separator)
lib/utils.ts          — cn() helper (clsx + tailwind-merge)
styles/globals.css    — Tailwind v4 imports + CSS variable theme
```

## AI Chat Route (`pages/api/chat.ts`)

- POST `{ messages, vehicleContext }` → streams SSE `data: { text }` chunks, ends with `data: [DONE]`
- Uses two cached system blocks: static expertise prompt + per-vehicle context
- Model: `claude-opus-4-6`, max tokens: 1024
- Prompt caching reduces cost on repeated queries about the same vehicle

## Key Conventions

- Vehicle IDs are kebab-case slugs: `toyota-camry-2024`
- `formatVehicleTitle(id)` converts slugs to display names in vehicle pages
- Compare page reads `?vehicles=id1,id2,id3` from the query string
- All AI streaming is handled client-side with `ReadableStream` + `TextDecoder`

## Planned Features

- [ ] Real YouTube Data API v3 integration (replace mock data in `vehicle/[id].tsx`)
- [ ] Google/SerpAPI article search integration
- [ ] PDF export via Puppeteer (`pages/api/export/pdf.ts`)
- [ ] Slide deck export via pptxgenjs or Google Slides API
- [ ] User sessions / saved comparisons (PostgreSQL)
- [ ] Vehicle image fetching

## Environment Variables

See `.env.local.example` for all required keys.
Required to run: `ANTHROPIC_API_KEY`

---

## Service Advisor Feature

An AI-powered service advisor tab where users describe a symptom and receive a diagnosed service quote.

### User Flow

1. User lands on `/service-advisor`
2. Fills in year/make/model (reuses existing vehicle search autocomplete) + free-text symptom field
3. Submits → AI analyzes and returns a structured diagnosis + service quote
4. Results render as an editable invoice (line items, costs, totals)
5. User can edit/remove rows, adjust labor rate, then export to PDF

### New Files

```
pages/
  service-advisor.tsx         — Main UI: smart form → editable invoice
  api/
    service-chat.ts           — Non-streaming Anthropic call, returns JSON diagnosis
```

### Data Model

```typescript
interface ServiceItem {
  id: string;
  service: string;       // "Brake pad replacement (front)"
  diagnosis: string;     // "Worn pads causing metal-on-metal contact"
  laborHours: number;    // 1.5
  partsCost: number;     // 85
  priority: "urgent" | "recommended" | "optional";
}

interface ServiceReport {
  summary: string;       // Plain English explanation for the customer
  items: ServiceItem[];
  notes: string;         // Disclaimers, "recommend inspection first", etc.
}
```

### API Route (`pages/api/service-chat.ts`)

- POST `{ year, make, model, symptoms }` → returns `ServiceReport` JSON (non-streaming)
- System prompt instructs Claude to act as a master automotive technician
- Claude must respond with a JSON block that the client parses into the invoice
- Model: `claude-opus-4-6`, max tokens: 1024

### Key Conventions

- Labor rate defaults to $150/hr, editable by the user in the invoice UI
- `priority` drives row color: urgent = red, recommended = yellow, optional = gray
- Invoice totals = sum of (laborHours × laborRate) + partsCost across all items
- PDF export reuses the `/api/export/pdf.ts` pattern with an invoice-specific HTML template

### Build Phases

- [x] Phase 1 — Nav link + page skeleton + smart form UI
- [x] Phase 2 — `service-chat.ts` API + AI JSON parsing + invoice render
- [x] Phase 3 — Editable invoice rows (name, hours, parts cost, remove)
- [x] Phase 4 — PDF export of completed service report
