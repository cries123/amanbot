import axios from 'axios';
import { config } from '../config.js';
import { getPool } from '../database/db.js';

export const startedAt = Date.now();

export function getUptime() {
  const ms = Date.now() - startedAt;
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export async function runHealthChecks() {
  const checks = [];

  checks.push({
    name: 'Discord',
    ok: true,
    detail: `Connected • uptime ${getUptime()}`,
  });

  if (config.apis.finnhub) {
    try {
      const { status } = await axios.get('https://finnhub.io/api/v1/quote', {
        params: { symbol: 'SPY', token: config.apis.finnhub },
        timeout: 10_000,
        validateStatus: () => true,
      });
      checks.push({
        name: 'Finnhub',
        ok: status === 200,
        detail: status === 200 ? 'API reachable' : `HTTP ${status}`,
      });
    } catch (err) {
      checks.push({ name: 'Finnhub', ok: false, detail: err.message });
    }
  } else {
    checks.push({ name: 'Finnhub', ok: false, detail: 'FINNHUB_API_KEY not set' });
  }

  try {
    const { status } = await axios.get('https://query1.finance.yahoo.com/v8/finance/chart/SPY', {
      params: { interval: '5m', range: '1d' },
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AmanBot/1.0)' },
      timeout: 10_000,
      validateStatus: () => true,
    });
    checks.push({
      name: 'Yahoo Finance',
      ok: status === 200,
      detail: status === 200 ? 'API reachable' : `HTTP ${status}`,
    });
  } catch (err) {
    checks.push({ name: 'Yahoo Finance', ok: false, detail: err.message });
  }

  const pool = getPool();
  if (pool) {
    try {
      await pool.query('SELECT 1');
      checks.push({ name: 'Database', ok: true, detail: 'PostgreSQL connected' });
    } catch (err) {
      checks.push({ name: 'Database', ok: false, detail: err.message });
    }
  } else {
    checks.push({ name: 'Database', ok: false, detail: 'DATABASE_URL not set (in-memory mode)' });
  }

  return checks;
}
