# Product Requirements Document
## Swing Trade Portfolio Simulator — "Journey to $1M"

**Product:** SwingTrack  
**Version:** 1.0  
**Author:** Hectar / Sri  
**Status:** Draft for Development  
**Date:** May 2026

---

## 1. Product Overview

SwingTrack is a mobile-first personal portfolio simulator and live trade tracker built for a concentrated three-stock portfolio (Nebius, CIFR, IREN). The product models a swing-accumulation strategy — sell at local highs, rebuy at local lows — to grow share count until a $1,000,000 portfolio value is reached at end-of-year target prices. It combines a cycle-by-cycle planning tool with live price tracking and browser notifications, giving the user real-time awareness of when to act.

### Core premise
Each "cycle" is one complete sell-and-rebuy loop. Because the sell price exceeds the rebuy price, each cycle leaves the user holding more shares with the same cash. The simulator projects how many named cycles (C1, C2, C3…) it takes to reach $1M at the user's price targets, with each cycle having its own individually configured sell price and buy-back price.

---

## 2. Problem Statement

Individual investors running concentrated, high-conviction portfolios lack a lightweight tool that:
- Models share accumulation through swing trades rather than just buy-and-hold returns
- Attaches named, per-cycle target prices to a single price trajectory
- Fires actionable alerts when live prices approach sell or buy-back levels
- Works cleanly on a phone without a Bloomberg subscription

Existing tools (brokerage apps, Google Sheets, TradingView) solve parts of this but force the user to mentally stitch together the cycle math, live prices, and alert logic themselves.

---

## 3. Goals and Success Metrics

| Goal | Metric |
|---|---|
| User can configure a full 5-cycle plan in under 3 minutes | Time-to-configured < 3 min on first open |
| Projected portfolio value updates without page reload | < 200ms render latency on input change |
| Live price fetch succeeds and returns prices | > 95% success rate; degrades gracefully |
| Alerts fire when prices are within 1.5% of a target | Notification delivery within 30s of threshold |
| App is fully usable on a 375px mobile viewport | No horizontal scroll; all inputs tappable |

---

## 4. User Persona

**Primary user: Sri**
- Runs a 3-stock concentrated portfolio from a mobile device
- Checks prices multiple times per day
- Wants to see what happens to share count and portfolio value across multiple planned cycles — not just "what is my stock worth today"
- Operates across time zones (Chennai / US markets)
- Does not want to open a laptop for a quick check; the phone must be the primary surface

---

## 5. Scope — Version 1.0

### In scope
- Portfolio overview dashboard with live prices
- Per-stock, per-cycle (C1–C5) sell and buy-back price configuration
- Slider + text input controls (fully in sync)
- Shares before and after each cycle displayed inline
- Journey visualization (node-by-node share accumulation path)
- Live price fetch via API
- Browser push notifications for price proximity alerts
- Auto-refresh interval setting (off / 1 min / 5 min / 15 min)
- Toggle-based navigation (Overview · Strategy · Journey · Alerts)
- Full mobile responsiveness (375px and above)

### Out of scope (v1.0)
- Multi-portfolio or multi-user support
- Brokerage API integration (actual order placement)
- Historical charting of realized trades
- Tax lot tracking

---

## 6. Feature Requirements

---

### 6.1 Navigation — Toggle Bar

The app uses a 4-section tab navigation. On mobile (< 640px) this renders as a sticky bottom tab bar. On desktop it renders as a pill-style top navigation row.

**Tabs:**
1. **Overview** — portfolio dashboard, live prices, milestones, mini chart
2. **Strategy** — per-stock, per-cycle C1–C5 target configuration
3. **Journey** — visual node timeline explaining the cycle path
4. **Alerts** — price alert status, notification controls, auto-refresh

**Behavior:**
- Active tab is visually distinct (filled background, primary text color)
- Switching tab does not reset any configured values
- Deep-linkable via hash routes (e.g., `#strategy`) so the app opens to the last active section

**Mobile:**
- Bottom bar fixed at viewport bottom, clear of system navigation insets (safe-area-inset-bottom)
- Icons + labels; icon-only at very narrow widths (< 360px)
- Tappable area minimum 44px height per tab

**Desktop:**
- Top pill row, left-aligned, below the live price bar

---

### 6.2 Live Price Bar

A persistent header strip displayed on every tab (above tab bar on mobile, inline with top controls on desktop).

**Elements:**
- Stock price badges: `NBIS $xxx.xx`, `CIFR $xx.xx`, `IREN $xx.xx`
- A live indicator dot (green when fresh, amber when stale > 5 min, pulsing when fetching)
- Refresh prices button
- Last-updated timestamp
- Enable alerts button

**Behavior:**
- Prices initialise from hardcoded defaults (last known)
- On refresh: calls the price API, updates all badges and all dependent computed values
- If fetch fails: timestamp reads "Refresh failed — tap to retry"
- Fetching state: button disabled, dot pulses amber

---

### 6.3 Overview Tab

**Metric row (4 cards):**

| Card | Value |
|---|---|
| Current portfolio | $191,489 (static — actual broker value) |
| At targets — today's shares | $299,583 (computed: current shares × target prices) |
| Projected at targets | Dynamic — computed from share count after N configured cycles |
| Progress to $1M | Percentage of projected value vs $1,000,000 |

**Cycles control:**
- Range slider: 1–5, integer steps
- +/– nudge buttons flanking a live counter
- Right-aligned label: "4 cycles needed for $1M" or "✓ $1M unlocked at C3" in success color

**Milestones strip:**
Four milestone markers: $300k, $500k, $750k, $1M. Each shows:
- Which cycle it is reached at (or "beyond 10 cycles" if not reachable)
- Icon: filled circle-check if the current cycles setting reaches it; outline circle if not
- Color: success tint for reached milestones

**Portfolio trajectory chart:**
- Line chart, x-axis = Now / C1 / C2 … CN, y-axis = portfolio value at targets
- One line per stock (stock color) + dashed total + dashed red $1M reference line
- Points turn blue when the value at that cycle exceeds $1M
- Custom legend row above chart (no Chart.js default legend)
- Chart updates live as cycle parameters change
- Height: 200px on mobile, 260px on desktop

**Per-stock summary cards (3 columns / stacked on mobile):**
Each mini card shows:
- Color dot + stock name
- Live price if available, else last known
- Shares after N cycles
- Projected value at target

---

### 6.4 Strategy Tab

The primary configuration surface. Each stock gets a card. Cards stack on mobile, display in a 3-column grid on desktop.

**Card header:**
- Color dot + stock name
- Starting position: "400 shares @ $187.49"
- Target price right-aligned: "target $300"

**Per-cycle sections (C1 through CN, where N = cycles set in Overview):**

Each cycle section is a distinct visual block inside the card. It contains:

*Cycle header row:*
- Cycle badge (e.g., "C1") in the stock's color tint
- Shares summary: `400 → 534 shares (+33.9%)` — shares before and after this cycle, with gain percentage
- Shares before is the shares-after from the previous cycle (or initial holding for C1)

*Sell price control:*
- Label: "Sell"
- Text input: typed price (2 decimal places); minimum tap target 44px height
- Range slider: synced bidirectionally with the text input; min = current price, max = target price × 1.1
- Small amber ↑ indicator (semantic: this is a sell-high action)

*Buy-back price control:*
- Label: "Buy"
- Text input: typed price (2 decimal places)
- Range slider: synced with text input; min = stock's floor estimate, max = sell price − 1 step
- Small green ↓ indicator (semantic: this is a buy-low action)

*Validation:*
- If buy price ≥ sell price: both borders turn red, gain shows "—", a tooltip reads "Buy price must be below sell price"
- If sell price > target price: yellow advisory badge "Above target"

*Cycle section highlight:*
- Amber background tint if live price is within 3% of the sell price for this cycle
- Green background tint if live price is within 3% of the buy-back price for this cycle
- Default background when neither condition is met

**Card summary footer:**
- "After N cycles" label
- Final shares count (bold)
- Value at target price (success color)

**Global cycles control (bottom of Strategy tab):**
- Mirrors the cycles control from Overview
- Changing it here also updates Overview instantly

---

### 6.5 Journey Tab

An explainer + visualization tab. Primary purpose: build intuition for what C1, C2, C3 mean.

**Explainer block (collapsible on repeat visits):**
Plain-language text explaining: each C is one complete sell-and-rebuy loop. Because sell price > buy price, each loop leaves you holding more shares with the same cash. The circles below trace your share count from today to your final cycle.

**Per-stock timeline:**

For each stock:
- Color dot + name + target price
- Horizontal scrollable node row: `Now → C1 → C2 → C3`
  - Each node: circle with label (Now / C1 / C2...) in stock color, shares count below, projected value at target below that, gain % in stock color
  - Arrow connectors between nodes
  - "Now" node uses neutral background
- Share accumulation bar chart below the node row:
  - One horizontal bar per cycle stage
  - Bar width proportional to shares vs final shares
  - Label on right: share count
  - Fills in stock color, "Now" bar in neutral

---

### 6.6 Alerts Tab

**Active alerts list:**

For each stock × each active cycle, two alert rows are shown:
- SELL alert: target sell price for that cycle
- BUY alert: target buy-back price for that cycle

Each row contains:
- Badge: SELL (amber tint) or BUY (green tint); turns red with "NEAR TARGET!" when within 3% of live price
- Target price (bold)
- Cycle label (e.g., "C2")
- Live distance: "live $xxx.xx (+5.2%)" or "NEAR TARGET!" if within threshold

**Notification controls:**
- "Enable notifications" button → triggers browser Notification.requestPermission()
- Status line: "Notifications enabled — fires within 1.5% of any target" or "Blocked — allow in browser settings"
- Button updates to "Notifications on" when granted

**Auto-refresh interval:**
- 4 options: Off / 1 min / 5 min / 15 min
- Pill button group; active option highlighted
- Setting persists for the session
- When active, shows a countdown to next refresh (optional — v1.1)

**Notification firing logic:**
- On every price refresh, compare live price to each configured sell and buy-back target across all configured cycles
- Fire a browser notification if: `|live - target| / target < 0.015`
- Notification title: `[Stock] — C[N] sell target approaching` or `[Stock] — C[N] buy-back zone`
- Notification body: `Live $xxx.xx near [sell/buy] target $xxx.xx`
- Deduplicate: do not re-fire the same alert within 10 minutes if price remains in the zone

---

## 7. Data Model

### Stock record
```
Stock {
  id: string              // 'nbis' | 'cifr' | 'iren'
  name: string            // 'Nebius' | 'CIFR' | 'IREN'
  ticker: string          // exchange ticker
  color: string           // hex color for UI
  initialShares: number   // shares held as of app init
  currentPrice: number    // last known price; updated on fetch
  targetPrice: number     // user's EOY target
  cycles: CycleTarget[]   // per-cycle sell/buy targets
  priceRange: {
    sellMin: number       // slider minimum for sell
    sellMax: number       // slider maximum for sell
    buyMin: number        // slider minimum for buy-back
    buyMax: number        // slider maximum for buy-back
  }
}
```

### Cycle target
```
CycleTarget {
  cycleIndex: number      // 0-based (C1 = index 0)
  sell: number            // sell target price
  buy: number             // buy-back target price
}
```

### Portfolio state
```
PortfolioState {
  activeCycles: number    // 1–5; currently configured
  stocks: Stock[]
  livePrices: Record<ticker, number>
  lastFetched: Date | null
  alertsFired: Record<string, Date>  // dedup key → last fired timestamp
}
```

### Computed values (derived, not stored)
```
CycleResult {
  sharesBefore: number
  sharesAfter: number
  gainPct: number
  sellPrice: number       // from target
  buyPrice: number        // from target
}

StockProjection {
  cycles: CycleResult[]
  finalShares: number
  valueAtTarget: number
}

PortfolioProjection {
  stockProjections: StockProjection[]
  totalValue: number
  progressPct: number
  cyclesToOneMillion: number | '>20'
}
```

---

## 8. Computation Logic

### Shares after a cycle
```
sharesAfter(i) = sharesBefore(i) × (sell[i] / buy[i])
```
Where `sharesBefore(0) = initialShares` and `sharesBefore(i) = sharesAfter(i-1)`.

### Portfolio value at targets after N cycles
```
portfolioValue(N) = cash + Σ (sharesAfter_stock(N) × targetPrice_stock)
```

### Cycles to $1M
Iterate N from 1 to 20. Return the first N where `portfolioValue(N) ≥ 1,000,000`.

### Cycle section highlight
```
if |livePrice - sellTarget| / sellTarget < 0.03 → amber tint
if |livePrice - buyTarget|  / buyTarget  < 0.03 → green tint
```

### Alert trigger
```
if |livePrice - target| / target < 0.015 AND
   (no alert fired for this stock+cycle+type within 10 min)
→ fire browser notification
```

---

## 9. UI / UX Specifications

### Responsive breakpoints

| Breakpoint | Layout |
|---|---|
| < 480px (small mobile) | Single column; bottom tab bar; compact metric cards 2×2 |
| 480px–639px (mobile) | Single column; bottom tab bar; metric cards 2×2 |
| 640px–1023px (tablet) | 2-column stock cards; top tab nav |
| ≥ 1024px (desktop) | 3-column stock cards; top tab nav; wider chart |

### Mobile-specific requirements

**Touch targets:**
- All interactive elements (sliders, buttons, inputs, tab items): minimum 44×44px tappable area
- Range slider thumb: 22px diameter rendered, 44px touch target
- Number inputs: large enough to read at a glance; tap opens numeric keyboard (type="number" with inputmode="decimal")

**Typography at mobile:**
- Minimum readable font size: 11px for labels, 12px for data, 13–14px for primary values
- No text smaller than 10px
- Line heights generous enough for scanning (1.4 minimum)

**Bottom tab bar (mobile):**
- Fixed, sticks above system navigation
- Safe area inset bottom honored (`env(safe-area-inset-bottom)`)
- Active tab: filled pill or underline indicator in primary color
- Inactive: muted icon + label

**Scrolling:**
- Each tab's content scrolls independently within the tab body
- Horizontal scroll only inside explicitly scrollable containers (stock node timeline, cycle tables)
- No full-page horizontal scroll at any breakpoint

**Card layout in Strategy tab (mobile):**
- Full-width cards stacked vertically
- Cycle sections within a card are compact but never cramped; each section ≈ 80px tall
- Tables (if used) have `overflow-x: auto` wrappers

### Design system tokens (reference the existing widget implementation)

The app uses CSS variables from the host design system:
- `--color-background-primary/secondary/tertiary` for surfaces
- `--color-text-primary/secondary` for text
- `--color-background-success/warning/danger/info` for semantic states
- `--color-text-success/warning/danger/info` for text on semantic backgrounds
- `--border-radius-md/lg/xl` for component rounding
- `--color-border-tertiary/secondary/primary` for borders

Stock accent colors:
- Nebius: `#1D9E75` (teal-green)
- CIFR: `#378ADD` (blue)
- IREN: `#D85A30` (coral)

---

## 10. Technical Architecture

### Recommended stack

**Frontend (primary):**
- React (Next.js) or vanilla JS PWA
- Chart.js 4.x for the portfolio trajectory chart
- CSS custom properties (design tokens) for theming
- No heavy UI framework dependency; the UI is custom-built

**State management:**
- Single global state object (React context or plain JS module)
- All computed values derived at render time from the state; nothing cached separately

**Persistence:**
- Session storage for portfolio state (resets on full reload — acceptable for v1.0)
- Optional: `localStorage` for persisting cycle targets across sessions (v1.1)

**Live price fetching:**
- Route through a lightweight server-side proxy (Next.js API route or Cloudflare Worker)
- The proxy calls a financial data API (Yahoo Finance query endpoint, Polygon.io free tier, or Alpaca market data)
- The client calls `/api/prices?tickers=NBIS,CIFR,IREN` — never calls the financial API directly from the browser to avoid CORS and to protect API keys
- Response shape: `{ NBIS: 187.49, CIFR: 20.25, IREN: 56.31, fetchedAt: ISO8601 }`
- Cache at proxy for 30 seconds to avoid rate-limit hammering

**Notifications:**
- Standard Web Notifications API (`Notification.requestPermission()`, `new Notification(...)`)
- On mobile browsers (iOS Safari): Web Notifications require the app to be installed as a PWA (Add to Home Screen); document this as a known limitation for iOS
- Android Chrome: Web Notifications work in browser

**PWA configuration (recommended):**
- `manifest.json` with name, short name, icons, theme color, `display: standalone`
- Service worker for offline shell (can still display last-fetched prices and configured targets)
- Add to Home Screen prompt for mobile users

### API integration — price fetch

```
GET /api/prices?tickers=NBIS,CIFR,IREN

Response:
{
  "NBIS": 193.45,
  "CIFR": 21.10,
  "IREN": 58.20,
  "fetchedAt": "2026-05-12T10:30:00Z",
  "source": "polygon"
}

Error response:
{
  "error": "upstream_timeout",
  "message": "Price feed unavailable",
  "lastKnown": { "NBIS": 187.49, "CIFR": 20.25, "IREN": 56.31 }
}
```

### Price data sources (in priority order)

| Source | Free tier | Latency | Notes |
|---|---|---|---|
| Polygon.io | 5 calls/min delayed | 15-min delay | Reliable, good docs |
| Yahoo Finance (unofficial) | Unlimited | Real-time | No official API; fragile |
| Alpaca Market Data | 200 calls/min | Real-time | Requires account |
| Twelve Data | 800 calls/day | Real-time | Good free tier |

**Recommendation:** Start with Polygon.io free tier. Upgrade to Twelve Data or Alpaca if real-time is required.

---

## 11. Screen-by-Screen Wireframe Reference

### Overview tab — mobile (375px)

```
┌─────────────────────────────┐
│ NBIS $193 │ CIFR $21 │ IREN $58 │ [Refresh] │
│ Updated 10:32am              │
├─────────────────────────────┤
│ Current portfolio            │
│ $191,489                     │
├──────────┬──────────────────┤
│ At targets│ Projected        │
│ $299,583  │ $778,000         │
├──────────┴──────────────────┤
│ Progress to $1M        77.8%│
│ [████████████░░░░░░░░░░░░░] │
├──────────┬──────────────────┤
│ Cycles: 3 │ To $1M: 4 cycles │
│ [−] [===] [+]               │
├─────────────────────────────┤
│ MILESTONES                  │
│ ✓ $300k — at C1             │
│ ✓ $500k — at C2             │
│ ○ $750k — at C4             │
│ ○ $1M   — at C4             │
├─────────────────────────────┤
│ [chart: 200px tall]         │
├────────┬──────┬─────────────┤
│ NBIS   │ CIFR │ IREN        │
│ 534 sh │ 7.9k │ 3.0k        │
│ $160k  │$237k │$272k        │
└────────┴──────┴─────────────┘
│ [Overview] [Strategy] [Journey] [Alerts] │  ← bottom tab bar
```

### Strategy tab — mobile (375px), single stock shown

```
┌─────────────────────────────┐
│ • Nebius          target $300│
│ 400 shares @ $187.49        │
├─────────────────────────────┤
│ [C1]  400 → 534 sh (+33.9%) │
│ Sell  [$225.00] [■■■■■░░░]↑ │
│ Buy   [$168.00] [■■░░░░░░]↓ │
├─────────────────────────────┤
│ [C2]  534 → 619 sh (+15.9%) │
│ Sell  [$210.00] [■■■░░░░░]↑ │
│ Buy   [$183.00] [■■■░░░░░]↓ │
├─────────────────────────────┤
│ [C3]  619 → 720 sh (+16.3%) │
│ Sell  [$265.00] [■■■■░░░░]↑ │
│ Buy   [$228.00] [■■■■░░░░]↓ │
├─────────────────────────────┤
│ After 3 cycles              │
│ 720 shares   $216,000       │
└─────────────────────────────┘
[CIFR card]
[IREN card]
[Cycles: 3] [−][+]
```

### Alerts tab — mobile

```
┌─────────────────────────────┐
│ Price alerts  [Notifications on] │
│ Alerts fire within 1.5% of any target
├─────────────────────────────┤
│ • Nebius                    │
│ [SELL] $225.00  C1  live $193 (+16.6%) │
│ [BUY]  $168.00  C1  live $193 (-12.9%) │
│ [SELL] $210.00  C2  live $193 (+8.8%)  │
│ [BUY]  $183.00  C2  live $193 (-5.2%)  │
│ [SELL!] $198.00 C3  NEAR TARGET!       │  ← highlighted
...
├─────────────────────────────┤
│ Auto-refresh                │
│ [Off] [1 min] [5 min] [15m] │
└─────────────────────────────┘
```

---

## 12. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Input response < 100ms; chart re-render < 200ms on mid-range Android |
| Offline | App shell loads offline; last-configured state and last prices visible |
| Accessibility | All interactive elements keyboard accessible; ARIA labels on icon-only buttons; chart has `role="img"` with descriptive `aria-label` |
| Browser support | Chrome 100+, Safari 15+ (iOS), Firefox 100+, Samsung Internet 14+ |
| Security | No API keys in client bundle; price fetch proxied server-side |
| Privacy | No user data leaves the device; no analytics in v1.0 |

---

## 12A. Feature — Tranche Management ("Sell in Thirds")

### Background

A full-position swing trade carries a critical risk: if you sell 100% at the sell target and the stock never pulls back to your rebuy level, you're sitting in cash while the position runs. Re-entering above your sell price costs you shares — any rebuy above your sell price leaves you with fewer shares than you started with.

The tranche strategy solves this by splitting the position:
- Swing trade a portion (default: ⅓)
- Hold the remainder ("core") permanently
- If the GTC buy fires: net gain on the tranche, core unchanged — you accumulate shares
- If price runs and you chase back in: small loss on the tranche only, core untouched — downside is bounded

The "chase back in" level defines when you give up waiting for the GTC and re-enter at market. Pre-defining this before the trade removes the psychological difficulty of the decision in the moment.

### Break-even table (Nebius, sell at $225, 400 shares)

| Re-entry price | Shares repurchased | vs. original | Net |
|---|---|---|---|
| $168 (GTC target) | 535 | +135 | Successful full cycle |
| $225 (sell price) | 400 | 0 | Break-even — as if held |
| $252 (+12% chase) | 357 | −43 | Small cost for re-entry |
| $300 (target price) | 300 | −100 | Worst case — missed the move |

With ⅓ tranche mode:
- 133 shares sold at $225 → $29,925 cash
- If GTC fires at $168: $29,925 / $168 = 178 shares → net +45 shares on tranche; 267 core untouched
- If chased in at $252: $29,925 / $252 = 118 shares → net −15 shares on tranche; 267 core untouched
- Total worst case: 385 shares vs 445 optimal vs original 400 — the downside range is narrow

### UI specification — Strategy tab additions

**Per-stock tranche toggle (card header):**
- A small pill button in each stock card header, right of the stock name
- States: "Full swing" (default, gray) → "⅓ Tranche" (active, stock color tint)
- Cycling behavior: Full → ⅓ Tranche → ½ Tranche → Custom % → Full
- When active: button adopts the stock's accent color with a light fill

**Swing % control (below card header, only when tranche is active):**
- Label: "Swing %"
- Number input (10–90, step 5), default 33
- Right label: "· X% core held always" showing the complement
- Background: very light tint of stock color to visually separate from cycle sections

**Per-cycle tranche section (inside each C1/C2/C3 block, below sell/buy controls):**
- Separated by a dashed divider
- Info line: "133 sh trading · 267 sh core held"
- Chase level control: "Chase if > [12]% → $252.00" — editable percentage input, live price display
- Two outcome rows:
  - Green row: "✓ GTC: 133 → 178 + 267 core = 445 sh (+11.1%)"
  - Red row: "✗ Chase $252: 133 → 118 + 267 core = 385 sh (−3.7%)"

**Card footer (tranche mode):**
- Optimal: "445 sh · $133,500 at target" (success color)
- Worst case: "385 sh · $115,500 worst case" (danger color)

**Alert additions for tranche mode:**
When tranche is active, a third alert fires if live price crosses the chase level (sell × 1.12):
- Notification: "[Stock] — C1 CHASE LEVEL hit"
- Body: "Live $252 hit your chase threshold — buy back in now or keep waiting?"
- This prompts the user to make the decision in real time rather than watching passively

### Computation — tranche mode

```
coreSh   = sharesBefore × (1 − swingPct/100)
swingSh  = sharesBefore × (swingPct/100)
chasePrice = sellPrice × (1 + chasePct/100)

Optimal (GTC fires):
  swingAfterOpt  = swingSh × (sellPrice / buyPrice)
  totalOpt       = coreSh + swingAfterOpt
  gain           = totalOpt / sharesBefore − 1

Chase (price runs past chase level):
  swingAfterChase = swingSh × (sellPrice / chasePrice)
  totalChase      = coreSh + swingAfterChase
  loss            = swingSh − swingAfterChase

Worst-case total (all cycles chased):
  Computed by chaining chase outcomes across all N cycles
  Shown in card footer; not used in main chart projection
```

The main chart always uses the optimal path. The worst case is a floor indicator, not a projection.

---



| Scenario | Behavior |
|---|---|
| Buy price ≥ Sell price | Red border on both inputs; gain shows "—"; cycle not counted toward total |
| Sell price > target price | Yellow advisory only; calculation continues |
| Price fetch fails | Retain last known prices; update status label; do not clear chart |
| Notifications denied | Status label explains how to re-enable in browser settings |
| iOS Safari (no PWA install) | Notification button shows "Add to Home Screen for alerts" tooltip |
| Cycles set to 5 but stock has only 3 configured cycles | Auto-extend cycles 4 and 5 using last cycle's prices × 1.1 with a visual "auto-estimated" badge |
| Live price is $0 or NaN from API | Discard; keep previous value; show "stale" indicator |
| Very large share counts (> 100,000) | Format as "102.3k" to prevent layout overflow |

---

## 14. Build Phases

### Phase 1 — Core Simulator (Week 1–2)
- Static data (no live prices)
- All 4 tabs functional
- Strategy tab with C1–C5 per-cycle price configuration
- Slider + text input sync
- Chart and milestones
- Mobile layout at 375px and 680px

**Exit criteria:** Full simulation runs end-to-end; all inputs update computed values in real time; no horizontal overflow on iPhone 14 Pro.

### Phase 2 — Live Prices (Week 3)
- Server-side price proxy API route
- Price fetch on button tap
- Auto-refresh with interval selector
- Stale/fresh price indicators
- Cycle sections highlight when near sell/buy targets

**Exit criteria:** Prices fetch and update without page reload; highlights work correctly.

### Phase 3 — Alerts and PWA (Week 4)
- Browser notification permission flow
- Notification firing on price proximity
- Alert deduplication (10-minute cooldown)
- PWA manifest and service worker
- Add to Home Screen prompt

**Exit criteria:** Notification fires within 30 seconds of price entering threshold on Android Chrome; PWA installable.

### Phase 4 — Persistence and Polish (Week 5)
- localStorage persistence of cycle targets and cycles count
- State survives page reload
- Smooth animations on tab switch and value updates
- iOS notification advisory for non-PWA users
- Performance audit and optimization

---

## 15. Open Questions

| Question | Owner | Due |
|---|---|---|
| Which price data API to use for real-time prices? | Sri | Before Phase 2 |
| Should the app support adding/removing stocks (generalization)? | Sri | v1.1 planning |
| Is 15-minute delayed pricing acceptable, or must it be real-time? | Sri | Before Phase 2 |
| Should configured cycle targets sync to cloud (multi-device)? | Sri | v1.1 planning |
| Android vs iOS — which to prioritize for PWA notifications? | Sri | Before Phase 3 |

---

## 16. Appendix — Cycle Math Reference

### Example: Nebius, 3 cycles

| Cycle | Shares Start | Sell Price | Buy Price | Shares End | Gain |
|---|---|---|---|---|---|
| Start | 400 | — | — | 400 | — |
| C1 | 400 | $225.00 | $168.00 | 535 | +33.9% |
| C2 | 535 | $210.00 | $183.00 | 614 | +14.8% |
| C3 | 614 | $265.00 | $228.00 | 713 | +16.2% |
| **At target $300** | | | | **713 shares** | **$213,900** |

### Why tapering buybacks make sense

In an uptrending stock, each successive rally is likely to produce a shallower pullback than the previous one. Setting C1 buy-back at −26% from the high, C2 at −21%, C3 at −17% reflects increasing trend strength. This means the user re-enters sooner in later cycles (shallower dip required), which is appropriate when conviction in the trend increases.

### Share accumulation formula

```
sharesEnd = sharesStart × (sellPrice / buyPrice)

Gain per cycle = (sellPrice / buyPrice) − 1

Example: sell $225, buy $168
Gain = 225/168 − 1 = 0.339 = 33.9%
```

The gain is determined entirely by the ratio of sell-to-buy prices. A wider spread = more shares per cycle. Tapering the spread in later cycles is intentional and conservative.
