# AmanBot — Discord Trading Bot

A modular Discord trading bot for your community, powered primarily by **Finnhub**.

## Features

| Module | Description | APIs |
|--------|-------------|------|
| SMC Scanner | Automated FVG + EQH/EQL detection on SPY, SPX, QQQ (5m) | Yahoo Finance |
| SMC Webhook Alerts | TradingView webhook → Discord embeds (optional) | TradingView |
| `/flow` | Live EQH/EQL scan on 5m, 1h, or 4h | Yahoo Finance |
| `/smctest` | Admin replay of last session's SMC setups | Yahoo Finance |
| `/chart` | On-demand candlestick charts | Finnhub (+ Yahoo fallback) |
| `/breakeven` | Options strategy risk/reward calculator | Internal math |
| IV Extremes | Alerts when realized vol percentile hits extremes | Finnhub |
| Economic Calendar | Monday overview + 30-min warnings before CPI, FOMC, NFP, etc. | Finnhub |
| `/news` | Live ticker news headlines | Finnhub |

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

### 3. Set Up PostgreSQL (optional — for IV history & economic dedup)

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

Renders a candlestick chart from Finnhub market data. Timeframes: `1m`, `5m`, `15m`, `1h`, `4h`, `1D`.

### `/flow [ticker] [timeframe]`

Live SMC scan on the latest **closed** candle.

- **5m** — FVG + EQH/EQL
- **1h** / **4h** — EQH/EQL only (higher-timeframe structure)

### `/smctest [ticker] [timeframe]` (Admin only)

Replays SMC detection on the **last regular trading session** so you can verify the scanner before market open. Use `ALL` to scan SPY, SPX, and QQQ.

### `/breakeven [strategy] [strike] [premium] [strike2] [contracts]`

Strategies:
- `naked_call` / `naked_put`
- `credit_call_spread` / `credit_put_spread`
- `debit_call_spread` / `debit_put_spread`

Returns breakeven price(s), max reward, and max risk.


## Channel Setup

Create dedicated Discord channels and set their IDs in `.env`:

| Variable | Purpose |
|----------|---------|
| `CHANNEL_SMC_ALERTS` | Automated Yahoo SMC scanner alerts (FVG, EQH, EQL) |
| `CHANNEL_OPTIONS_FLOW` | Legacy channel (unused by SMC scanner) |
| `CHANNEL_IV_ALERTS` | IV extreme notifications |
| `CHANNEL_ECONOMIC` | Economic calendar & warnings |

## API Dependencies & Notes

### Yahoo Finance (SMC scanner — no API key)
- **5m OHLCV**: Yahoo Finance chart API for SPY, ^GSPC (SPX), QQQ (with retry + rate-limit handling)
- **FVG**: Bullish when candle 3 low > candle 1 high; bearish when candle 3 high < candle 1 low
- **EQH/EQL**: Swing pivots within `EQH_EQL_TOLERANCE_PCT` (default 0.05%)
- Runs every 5 minutes during regular market hours via `SMC_SCAN_CRON`

### Finnhub (charts, IV, calendar, news)
- **Charts**: `/stock/candle` OHLCV → rendered as candlestick PNG (Yahoo fallback on 403)
- **IV monitor**: Realized volatility percentile from daily candles
- **Economic calendar**: `/calendar/economic` — filtered for CPI, FOMC, NFP, etc.

> **Note:** The SMC scanner uses Yahoo Finance locally — no TradingView webhooks or premium chart APIs required.

### PostgreSQL
- Optional for IV alert history and deduplicating economic warnings

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
│   ├── yahooMarket.js       # Yahoo Finance 5m candles
│   ├── smcScanner.js        # Live + history SMC scans
│   └── finnhub.js           # Economic calendar, IV, charts
├── monitors/
│   ├── smcScanner.js        # Automated FVG/EQH/EQL alerts
│   ├── ivMonitor.js         # IV percentile alerts
│   └── economicCalendar.js  # Weekly + 30-min warnings
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
| `FVG_MIN_GAP_PCT` | 0.02 | Minimum FVG gap size (%) |
| `EQH_EQL_TOLERANCE_PCT` | 0.05 | Max pivot spread for EQH/EQL (%) |
| `SMC_TIMEFRAMES` | 5m,1h,4h | Timeframes to scan (1h/4h = EQH/EQL only) |
| `SMC_SCAN_CRON` | `1,6,11,... 9-16` | Scan schedule (5m every 5 min, 1h hourly, 4h twice daily) |

All cron schedules use `America/New_York` timezone.

## License

MIT
