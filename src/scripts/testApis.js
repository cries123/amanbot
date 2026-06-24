import 'dotenv/config';
import axios from 'axios';

const results = [];

function pass(name, detail) {
  results.push({ name, ok: true, detail });
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
}

async function testChartImg() {
  const key = process.env.CHART_IMG_API_KEY;
  if (!key || key.includes('your_')) {
    fail('Chart-img', 'CHART_IMG_API_KEY is missing in .env');
    return;
  }

  try {
    const { status, data } = await axios.post(
      'https://api.chart-img.com/v2/tradingview/advanced-chart/storage',
      { symbol: 'NASDAQ:SPY', interval: '1D', width: 800, height: 600 },
      { headers: { 'x-api-key': key, 'content-type': 'application/json' }, timeout: 30_000 },
    );

    if (status === 200 && (data?.url || data?.imageUrl)) {
      pass('Chart-img', 'API key works — chart URL returned');
    } else {
      pass('Chart-img', `API responded (${status})`);
    }
  } catch (err) {
    const status = err.response?.status;
    if (status === 401 || status === 403) {
      fail('Chart-img', `Invalid key or plan limit (${status})`);
    } else {
      fail('Chart-img', err.response?.data?.message ?? err.message);
    }
  }
}

async function testFinnhub() {
  const key = process.env.FINNHUB_API_KEY;
  if (!key || key.includes('your_')) {
    fail('Finnhub', 'FINNHUB_API_KEY is missing in .env');
    return;
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await axios.get('https://finnhub.io/api/v1/calendar/economic', {
      params: { token: key, from: today, to: today },
      timeout: 15_000,
    });

    const count = data?.economicCalendar?.length ?? 0;
    pass('Finnhub', `API key works — ${count} events found for today`);
  } catch (err) {
    const status = err.response?.status;
    if (status === 401 || status === 403) {
      fail('Finnhub', 'Invalid API key');
    } else {
      fail('Finnhub', err.response?.data?.error ?? err.message);
    }
  }
}

async function testPolygon() {
  const key = process.env.POLYGON_API_KEY;
  if (!key || key.includes('your_')) {
    fail('Polygon', 'POLYGON_API_KEY is missing in .env');
    return;
  }

  try {
    const { data } = await axios.get('https://api.polygon.io/v3/snapshot/options/SPY', {
      params: { apiKey: key },
      timeout: 15_000,
    });

    const count = data?.results?.length ?? 0;
    if (count > 0) {
      pass('Polygon', `API key works — ${count} SPY option contracts returned`);
    } else {
      pass('Polygon', 'API key works (no options data — check your plan includes options)');
    }
  } catch (err) {
    const status = err.response?.status;
    if (status === 401 || status === 403) {
      fail('Polygon', 'Invalid API key');
    } else {
      fail('Polygon', err.response?.data?.error ?? err.message);
    }
  }
}

function testDiscordEnv() {
  const required = [
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_ID',
    'DISCORD_GUILD_ID',
    'CHANNEL_SMC_ALERTS',
    'CHANNEL_OPTIONS_FLOW',
    'CHANNEL_IV_ALERTS',
    'CHANNEL_ECONOMIC',
    'CHANNEL_SENTIMENT',
  ];

  const missing = required.filter((k) => !process.env[k] || process.env[k].includes('your_') || process.env[k].includes('channel_id'));
  if (missing.length === 0) {
    pass('Discord .env', 'All Discord variables are set');
  } else {
    fail('Discord .env', `Missing or placeholder: ${missing.join(', ')}`);
  }
}

console.log('\n🔍 AmanBot API Key Test\n');

testDiscordEnv();
await testChartImg();
await testFinnhub();
await testPolygon();

for (const { name, ok, detail } of results) {
  console.log(`${ok ? '✅' : '❌'} ${name}: ${detail}`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0 ? '\nAll checks passed!\n' : `\n${failed} check(s) failed — fix .env and run again.\n`);
process.exit(failed > 0 ? 1 : 0);
