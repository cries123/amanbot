import axios from 'axios';
import { config } from '../config.js';

const BASE = 'https://api.polygon.io';

function polygonGet(path, params = {}) {
  if (!config.apis.polygon) {
    throw new Error('POLYGON_API_KEY is not configured');
  }
  return axios.get(`${BASE}${path}`, {
    params: { ...params, apiKey: config.apis.polygon },
    timeout: 20_000,
  });
}

export async function getOptionsChainSnapshot(underlying) {
  const { data } = await polygonGet(`/v3/snapshot/options/${underlying}`);
  return data?.results ?? [];
}

export async function getStockDailyBars(ticker, from, to) {
  const { data } = await polygonGet(`/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`, {
    adjusted: true,
    sort: 'asc',
    limit: 500,
  });
  return data?.results ?? [];
}

export async function getPreviousClose(ticker) {
  const { data } = await polygonGet(`/v2/aggs/ticker/${ticker}/prev`);
  return data?.results?.[0] ?? null;
}

function isToday(dateStr) {
  const today = new Date().toISOString().slice(0, 10);
  return dateStr === today;
}

export function scan0DteFlow(snapshots, thresholds) {
  const signals = [];
  const { minPremium, minVoiRatio } = thresholds;
  const seen = new Set();

  for (const item of snapshots) {
    const details = item.details ?? item;
    const day = item.day ?? {};
    const greeks = item.greeks ?? {};

    const expiry = details.expiration_date;
    if (!expiry || !isToday(expiry)) continue;

    const volume = day.volume ?? item.volume ?? 0;
    const openInterest = item.open_interest ?? details.open_interest ?? 0;
    const price = day.close ?? item.last_trade?.price ?? 0;
    const premium = volume * price * 100;

    if (volume < 10 || premium < minPremium) continue;

    const voiRatio = openInterest > 0 ? volume / openInterest : volume;
    if (voiRatio < minVoiRatio) continue;

    const contract = details.ticker ?? item.ticker;
    if (seen.has(contract)) continue;
    seen.add(contract);

    signals.push({
      underlying: details.underlying_ticker ?? details.underlying_asset?.ticker,
      contract,
      strike: details.strike_price,
      expiry,
      optionType: details.contract_type ?? 'unknown',
      volume,
      openInterest,
      price,
      premium,
      voiRatio,
      delta: greeks.delta ?? null,
      iv: item.implied_volatility ?? greeks.implied_volatility ?? null,
    });
  }

  return signals.sort((a, b) => b.premium - a.premium);
}

export async function estimateIvPercentile(ticker) {
  const today = new Date();
  const from = new Date(today);
  from.setFullYear(from.getFullYear() - 1);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = today.toISOString().slice(0, 10);

  const snapshots = await getOptionsChainSnapshot(ticker);
  const atmIv = extractAtmIv(snapshots);
  if (atmIv == null) return null;

  const bars = await getStockDailyBars(ticker, fromStr, toStr);
  if (bars.length < 30) {
    return { ivPercentile: null, currentIv: atmIv, ticker };
  }

  const returns = [];
  for (let i = 1; i < bars.length; i++) {
    const r = Math.log(bars[i].c / bars[i - 1].c);
    returns.push(r);
  }

  const window = 20;
  const historicalVols = [];
  for (let i = window; i < returns.length; i++) {
    const slice = returns.slice(i - window, i);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    historicalVols.push(Math.sqrt(variance * 252));
  }

  if (historicalVols.length === 0) {
    return { ivPercentile: null, currentIv: atmIv, ticker };
  }

  const below = historicalVols.filter((hv) => hv <= atmIv).length;
  const ivPercentile = (below / historicalVols.length) * 100;

  return { ivPercentile, currentIv: atmIv, ticker };
}

function extractAtmIv(snapshots) {
  let best = null;
  let bestDeltaDist = Infinity;

  for (const item of snapshots) {
    const details = item.details ?? item;
    const greeks = item.greeks ?? {};
    const delta = Math.abs(greeks.delta ?? 0);
    const iv = item.implied_volatility ?? greeks.implied_volatility;

    if (!iv || delta < 0.2 || delta > 0.6) continue;

    const dist = Math.abs(delta - 0.5);
    if (dist < bestDeltaDist) {
      bestDeltaDist = dist;
      best = iv;
    }
  }

  return best;
}
