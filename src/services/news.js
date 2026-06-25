import axios from 'axios';
import { config } from '../config.js';
import { normalizeTicker } from './finnhub.js';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const MAX_SUMMARY_LENGTH = 280;

function truncate(text, max = MAX_SUMMARY_LENGTH) {
  if (!text) return 'No summary available.';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 3).trim()}...`;
}

function normalizeArticle(article) {
  return {
    headline: article.headline?.trim() || 'Untitled',
    url: article.url,
    source: article.source || 'Unknown',
    publishedAt: article.publishedAt,
    summary: truncate(article.summary),
  };
}

function dateRange(daysBack = 3) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - daysBack);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

async function fetchFinnhubNews(symbol) {
  const { from, to } = dateRange(7);

  const { data, status } = await axios.get(`${FINNHUB_BASE}/company-news`, {
    params: { symbol, from, to, token: config.apis.finnhub },
    timeout: 15_000,
    validateStatus: (s) => s < 500,
  });

  if (status === 403 || status === 401) {
    throw Object.assign(new Error('Finnhub news access denied'), { code: 'FINNHUB_NEWS_DENIED' });
  }

  if (!Array.isArray(data)) {
    throw new Error('Unexpected Finnhub news response');
  }

  return data
    .filter((item) => item.headline && item.url)
    .sort((a, b) => b.datetime - a.datetime)
    .slice(0, 10)
    .map((item) => normalizeArticle({
      headline: item.headline,
      url: item.url,
      source: item.source,
      publishedAt: new Date(item.datetime * 1000),
      summary: item.summary,
    }));
}

async function fetchYahooNews(symbol) {
  const { data } = await axios.get('https://query1.finance.yahoo.com/v1/finance/search', {
    params: { q: symbol, quotesCount: 0, newsCount: 10 },
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AmanBot/1.0)' },
    timeout: 15_000,
  });

  const items = data?.news ?? [];

  return items
    .filter((item) => item.title && item.link)
    .map((item) => normalizeArticle({
      headline: item.title,
      url: item.link,
      source: item.publisher || 'Yahoo Finance',
      publishedAt: new Date((item.providerPublishTime ?? 0) * 1000),
      summary: item.summary ?? item.title,
    }));
}

export async function fetchTickerNews(ticker, limit = 5) {
  if (!config.apis.finnhub) {
    throw new Error('FINNHUB_API_KEY is not configured');
  }

  const symbol = normalizeTicker(ticker);
  let articles = [];
  let source = 'finnhub';

  try {
    articles = await fetchFinnhubNews(symbol);
  } catch (err) {
    if (err.code === 'FINNHUB_NEWS_DENIED') {
      console.warn(`[news] Finnhub denied ${symbol} — falling back to Yahoo`);
      articles = await fetchYahooNews(symbol);
      source = 'yahoo';
    } else {
      throw err;
    }
  }

  if (articles.length === 0) {
    articles = await fetchYahooNews(symbol);
    source = 'yahoo';
  }

  const unique = [];
  const seen = new Set();
  for (const article of articles) {
    const key = article.url ?? article.headline;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(article);
    if (unique.length >= limit) break;
  }

  if (unique.length === 0) {
    throw new Error(`No recent news found for ${symbol}`);
  }

  return {
    symbol,
    articles: unique,
    source: source === 'finnhub' ? 'Finnhub' : 'Yahoo Finance',
  };
}
