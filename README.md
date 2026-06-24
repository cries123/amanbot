# AmanBot — Discord Trading Bot

A modular Discord trading bot for your community, built around **Finnhub**, **Chart-img**, and **Polygon.io**.

## Features

| Module | Description | APIs |
|--------|-------------|------|
| SMC Structure Alerts | TradingView webhook → Discord embeds for EQH/EQL sweeps and FVG creation/fills | TradingView (your alerts) |
| `/chart` | On-demand TradingView chart snapshots | Chart-img |
| 0DTE Options Flow | Live monitor for high-premium blocks and unusual vol/OI on SPY/SPX | Polygon |
| `/breakeven` | Options strategy risk/reward calculator | Internal math |
| IV Extremes | Alerts when IV percentile drops below 10% or spikes above 90% | Polygon |
| Sentiment Polls | Daily pre-market poll with accuracy leaderboard | Postgres + Finnhub |
| Economic Calendar | Monday overview + 30-min warnings before CPI, FOMC, NFP, etc. | Finnhub |
| `/stats` | Community sentiment win-rate stats | Postgres |

## Quick Start

### 1. Create a Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create an application → Bot → copy the **token**
3. Enable **Message Content Intent** is not required (slash commands only)
4. OAuth2 → URL Generator → scopes: `bot`, `applications.commands` → invite to your server
5. Copy **Application ID** (client ID) and your **Server ID**

### 2. Configure Environment

```bash
cp .env.example .env
# Fill in all values in .env
```

### 3. Set Up PostgreSQL (for polls & stats)

```bash
createdb amanbot
# Set DATABASE_URL in .env
```

Tables are created automatically on first boot.

### 4. Install & Run

```bash
npm install
npm run register-commands   # Register slash commands
npm start
```

For development with auto-reload:

```bash
npm run dev
```

### 5. TradingView Webhook Setup

Point your TradingView alert webhook to:

```
POST https://your-server.com/webhook/tradingview
```

Optional header: `x-webhook-secret: your_secret` (set `WEBHOOK_SECRET` in `.env`)

**Example TradingView alert message (JSON):**

```json
{
  "event_type": "FVG_CREATE",
  "ticker": "SPY",
  "timeframe": "15m",
  "price": 580.25,
  "zone_low": 579.50,
  "zone_high": 580.00,
  "message": "Bullish FVG formed after liquidity sweep"
}
```

Supported `event_type` values: `EQH`, `EQL`, `FVG_CREATE`, `FVG_FILL` (or TradingView-friendly variants like `EQUAL_HIGH`, `FVG_FILL`).

## Slash Commands

### `/chart [ticker] [timeframe]`

Renders a TradingView chart via Chart-img. Timeframes: `1m`, `5m`, `15m`, `1h`, `4h`, `1D`.

### `/breakeven [strategy] [strike] [premium] [strike2] [contracts]`

Strategies:
- `naked_call` / `naked_put`
- `credit_call_spread` / `credit_put_spread`
- `debit_call_spread` / `debit_put_spread`

Returns breakeven price(s), max reward, and max risk.

### `/stats`

Shows community sentiment poll accuracy, win rate, and top predictors.

## Channel Setup

Create dedicated Discord channels and set their IDs in `.env`:

| Variable | Purpose |
|----------|---------|
| `CHANNEL_SMC_ALERTS` | TradingView structure alerts |
| `CHANNEL_OPTIONS_FLOW` | 0DTE options flow pings |
| `CHANNEL_IV_ALERTS` | IV extreme notifications |
| `CHANNEL_ECONOMIC` | Economic calendar & warnings |
| `CHANNEL_SENTIMENT` | Daily sentiment polls |

## API Dependencies & Notes

### Chart-img
- Used for `/chart` command
- Supports custom indicators via `studies` parameter
- Optional TradingView session headers for premium indicators

### Polygon.io
- **Options flow**: `/v3/snapshot/options/{ticker}` — scans 0DTE contracts for premium/volume thresholds
- **IV monitor**: ATM implied vol vs 1-year realized vol history for percentile estimation
- Requires at least **Starter** plan with options data access

### Finnhub
- **Economic calendar**: `/calendar/economic` — filtered for CPI, FOMC, NFP, JOLTS, jobless claims, ADP
- **Sentiment grading**: SPY daily candle to determine bullish/bearish close

### PostgreSQL
- Required for sentiment polls, vote tracking, leaderboard, and deduplication of economic warnings
- Optional for IV alert history

## Deployment

The bot runs a single Node.js process that includes:
- Discord bot (gateway connection)
- Express webhook server (default port 3000)
- Cron schedulers for all monitors

For production, use a process manager (PM2, systemd) and expose port 3000 behind a reverse proxy (nginx/Caddy) for the TradingView webhook.

**Health check:** `GET /health`

## Architecture

```
src/
├── index.js                 # Entry point
├── config.js                # Environment config
├── bot/
│   ├── client.js            # Discord client
│   ├── commands/            # Slash commands
│   └── handlers/            # Interaction routing
├── services/
│   ├── chartimg.js          # Chart-img API
│   ├── polygon.js           # Polygon options & IV
│   └── finnhub.js           # Economic calendar & SPY data
├── monitors/
│   ├── optionsFlow.js       # 0DTE flow scanner
│   ├── ivMonitor.js         # IV percentile alerts
│   ├── economicCalendar.js  # Weekly + 30-min warnings
│   └── sentimentPolls.js    # Daily polls + grading
├── webhooks/
│   └── tradingview.js       # SMC alert endpoint
├── database/
│   └── db.js                # Postgres schema & queries
└── utils/
    ├── embeds.js            # Discord embed builders
    └── breakeven.js         # Options math
```

## Tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `OPTIONS_MIN_PREMIUM` | 25000 | Min total premium ($) to alert |
| `OPTIONS_MIN_VOI_RATIO` | 3 | Min volume/OI ratio |
| `IV_LOW_THRESHOLD` | 10 | IV percentile low alert |
| `IV_HIGH_THRESHOLD` | 90 | IV percentile high alert |
| `IV_WATCHLIST` | SPY,QQQ,... | Tickers to scan |
| `SENTIMENT_POLL_CRON` | `0 8 * * 1-5` | 8 AM ET weekdays |

All cron schedules use `America/New_York` timezone.

## License

MIT
