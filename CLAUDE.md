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
