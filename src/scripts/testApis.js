import 'dotenv/config';
import axios from 'axios';
import { fetchChartImage, scanTickerSmcFlow } from '../services/finnhub.js';
import { fetchTickerNews } from '../services/news.js';

const results = [];

function pass(name, detail) {
  results.push({ name, ok: true, detail });
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
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
    pass('Finnhub', `API key works — ${count} economic events today`);
  } catch (err) {
    const status = err.response?.status;
    if (status === 401 || status === 403) {
      fail('Finnhub', 'Invalid API key');
    } else {
      fail('Finnhub', err.response?.data?.error ?? err.message);
    }
  }
}

async function testFinnhubChart() {
  if (!process.env.FINNHUB_API_KEY || process.env.FINNHUB_API_KEY.includes('your_')) {
    fail('Finnhub Chart', 'FINNHUB_API_KEY missing');
    return;
  }

  try {
    const { buffer, symbol } = await fetchChartImage('SPY', '15m');
    if (buffer?.length > 1000) {
      pass('Finnhub Chart', `Chart rendered for ${symbol} (${buffer.length} bytes)`);
    } else {
      fail('Finnhub Chart', 'Chart buffer too small');
    }
  } catch (err) {
    fail('Finnhub Chart', err.message);
  }
}

async function testFinnhubFlow() {
  if (!process.env.FINNHUB_API_KEY || process.env.FINNHUB_API_KEY.includes('your_')) {
    fail('Finnhub Flow', 'FINNHUB_API_KEY missing');
    return;
  }

  try {
    const { diagnostics, signals } = await scanTickerSmcFlow('SPY', { timeframe: '5m', tolerance: 0.05 });
    pass('Finnhub EQH/EQL', `Connected — ${diagnostics.eqhClusters} EQH, ${diagnostics.eqlClusters} EQL, ${signals.length} signals`);
  } catch (err) {
    fail('Finnhub EQH/EQL', err.message);
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
  ];

  const missing = required.filter((k) => !process.env[k] || process.env[k].includes('your_') || process.env[k].includes('channel_id'));
  if (missing.length === 0) {
    pass('Discord .env', 'All Discord variables are set');
  } else {
    fail('Discord .env', `Missing or placeholder: ${missing.join(', ')}`);
  }
}

async function testFinnhubNews() {
  if (!process.env.FINNHUB_API_KEY || process.env.FINNHUB_API_KEY.includes('your_')) {
    fail('Finnhub News', 'FINNHUB_API_KEY missing');
    return;
  }

  try {
    const { articles, source } = await fetchTickerNews('SPY', 3);
    pass('Finnhub News', `${articles.length} articles via ${source} — latest: "${articles[0].headline.slice(0, 50)}..."`);
  } catch (err) {
    fail('Finnhub News', err.message);
  }
}

console.log('\n🔍 AmanBot API Key Test\n');

testDiscordEnv();
await testFinnhub();
await testFinnhubChart();
await testFinnhubFlow();
await testFinnhubNews();

for (const { name, ok, detail } of results) {
  console.log(`${ok ? '✅' : '❌'} ${name}: ${detail}`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0 ? '\nAll checks passed!\n' : `\n${failed} check(s) failed — fix .env and run again.\n`);
process.exit(failed > 0 ? 1 : 0);
