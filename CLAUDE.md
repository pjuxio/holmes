# Climate Justice Resource Library — AI Chat Interface

## Project Overview

A public-facing, AI-powered chat interface that allows users to search and explore a library of ~800 climate justice web resources using natural language. Built as a standalone static site embeddable via iframe on any website (e.g., WordPress).

No backend required. All search logic runs client-side; Claude API handles semantic synthesis.

---

## Tech Stack

- **Framework**: Vanilla HTML/CSS/JS or React (single `.jsx` file)
- **AI**: Anthropic Claude API (`claude-sonnet-4-20250514`) via `fetch`
- **Data**: Local JSON flat file (`resources.json`) — no database
- **Hosting**: Static file (Netlify, GitHub Pages, or iframe embed)
- **Styling**: CSS custom properties, no external UI frameworks

---

## Project Structure

```
/
├── CLAUDE.md               ← this file
├── index.html              ← entry point
├── app.jsx                 ← main React component (if using React)
├── data/
│   └── resources.json      ← the 800-resource library
├── styles/
│   └── main.css            ← design tokens + global styles
└── README.md
```

---

## Data Contract

Each resource in `resources.json` follows this shape (converted from WordPress CSV export):

```json
{
  "id": "1541",
  "title": "Resource Title",
  "url": "https://example.org/resource",
  "description": "One to three sentence summary extracted from Content field.",
  "tags": ["Emergency Management", "Organizing"],
  "org": "Organization Name (from Organizational Author or Resource Author)",
  "type": "video | article | toolkit | report | guide | dataset | audio | case study"
}
```

**CSV to JSON mapping** (see `data/convert_csv.py`):
- `id` ← CSV `ID`
- `title` ← CSV `Title`
- `url` ← CSV `Link` (fallback to `Permalink`)
- `description` ← Extracted from CSV `Content` (HTML stripped, URLs removed, max 300 chars)
- `tags` ← CSV `Tags` + alignment fields (`Alignment: JTF`, etc.) + `BIPOC-led` flag
- `org` ← CSV `Organizational Author` or `Resource Author`
- `type` ← Inferred from CSV `Categories` (e.g., "Videos & Webinars" → "video")

If the actual field names differ, update this section to match before starting any development.

---

## Architecture

### Search Flow

1. User types a natural language query into the chat input
2. Client-side scoring function filters/ranks all 800 resources against the query
   - Keyword match on `title`, `description`, `tags`, `org`
   - Boost exact tag matches
   - Return top 60 candidates max
3. Top candidates + user query sent to Claude API
4. Claude returns a conversational response citing specific resources
5. Response renders in chat thread with linked resource cards

### Why This Approach

- Context window stays manageable (60 records ≈ ~15K tokens, well within Sonnet limits)
- No embedding pipeline or vector DB required
- Works fully offline except for the API call
- Cheap per query (~$0.01–0.03 depending on record size)

---

## Claude API Integration

```javascript
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-calls": "true"
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: conversationHistory
  })
});
```

**IMPORTANT**: The API key is exposed in the browser. For MVP/demo this is acceptable. For production, proxy through a serverless function (Netlify Function, Vercel Edge, etc.).

---

## System Prompt

```
You are a research librarian for the climate justice movement. 
You help advocates, organizers, and researchers find resources from a curated library.

When a user asks a question:
1. Review the provided candidate resources
2. Select the most relevant ones (usually 3–7)
3. Respond conversationally, explaining WHY each resource is relevant to their specific question
4. Reference resources by title and include their URL
5. If no resources are a strong match, say so honestly and suggest how the user might refine their search

Keep responses focused and actionable. Prioritize resources from frontline and BIPOC-led organizations when they are relevant.

The candidate resources will be provided in JSON format at the end of each user message.
```

---

## Client-Side Scoring Function

```javascript
function scoreResources(query, resources) {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  
  return resources
    .map(r => {
      let score = 0;
      const searchText = [
        r.title, r.description, r.org,
        ...(r.tags || [])
      ].join(" ").toLowerCase();
      
      terms.forEach(term => {
        if (searchText.includes(term)) score += 1;
        if ((r.tags || []).some(tag => tag.toLowerCase().includes(term))) score += 2;
        if (r.title.toLowerCase().includes(term)) score += 2;
      });
      
      return { ...r, _score: score };
    })
    .filter(r => r._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 60);
}
```

---

## Design Direction

**Aesthetic**: Editorial / movement archive. Dark forest green background, warm ochre/amber accents, strong serif display type. Feels like a zine meets a research archive — not a SaaS product.

**Key UI Elements**:
- Chat thread (left-weighted, full width on mobile)
- Resource cards inline in responses (title, org, type badge, URL)
- Minimal chrome — no sidebar, no filters in MVP
- Typing indicator while Claude responds
- Empty state with 3–5 suggested starter prompts

**Accessibility**:
- All interactive elements keyboard-navigable
- ARIA live region on chat thread for screen readers
- Color contrast minimum AA (4.5:1)
- No motion without `prefers-reduced-motion` check

---

## Development Workflow

For each task, follow this sequence:

1. **Understand** — read this file and any referenced data before touching code
2. **Plan** — state what you're about to build and why before writing
3. **Build** — write clean, commented code
4. **Verify** — check against the data contract and design direction above
5. **Commit** — conventional commit format: `feat:`, `fix:`, `style:`, `refactor:`

---

## Build Phases

### Phase 1 — Static Shell (no API)
- `index.html` with chat UI layout
- Load and display `resources.json` count in header
- Hardcoded example response to validate layout

### Phase 2 — Client-Side Search
- Implement `scoreResources()` function
- Wire to input — show filtered results as plain list
- No Claude API yet

### Phase 3 — Claude Integration
- Add API call with system prompt + top candidates
- Stream or poll response into chat thread
- Render resource cards from cited URLs

### Phase 4 — Polish
- Suggested starter prompts on empty state
- Typing indicator / loading state
- Error handling (API failure, no results)
- Mobile layout pass
- Accessibility audit

---

## Constraints and Non-Negotiables

- No backend server required in MVP
- No external UI libraries (no Bootstrap, no Tailwind, no shadcn)
- No PDF generation — markdown output only for any reports
- Resources JSON is source of truth — do not hardcode resource data elsewhere
- All `fetch` calls wrapped in try/catch with user-visible error states
- Never expose API key in committed code — use `const API_KEY = "YOUR_KEY_HERE"` as placeholder

---

## Known Constraints

- 800 records × ~200 tokens each = ~160K tokens if passed whole — do NOT pass the full library to Claude. Always pre-filter to ≤60 records first.
- Anthropic API does not support CORS from browser by default in production — use the `anthropic-dangerous-direct-browser-calls: true` header for local dev/demo only. Flag for serverless proxy in Phase 4.

---

## Future Considerations (Post-MVP)

- Supabase pgvector for true semantic search at scale
- Multilingual support (Spanish) — same i18n pattern as Pupusas.io
- Saved search / bookmarking via localStorage
- Submission form for community-contributed resources
- Analytics on most-searched topics for TCLP program insight
