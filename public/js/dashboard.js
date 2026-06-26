const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let smcTimeframe = '1h';

async function api(path) {
  const res = await fetch(path);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

function formatPrice(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return `$${Number(n).toFixed(2)}`;
}

function formatChange(change, pct) {
  if (change == null) return '';
  const sign = change >= 0 ? '+' : '';
  const cls = change >= 0 ? 'up' : 'down';
  const pctStr = pct != null ? ` (${sign}${pct.toFixed(2)}%)` : '';
  return `<span class="quote-change ${cls}">${sign}${change.toFixed(2)}${pctStr}</span>`;
}

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderQuotes(data) {
  const el = $('#quotes');
  if (!data.quotes?.length) {
    el.innerHTML = '<div class="empty">No quote data available</div>';
    return;
  }

  el.innerHTML = data.quotes.map((q) => {
    if (q.error) {
      return `<div class="quote-card"><div class="quote-ticker">${q.ticker}</div><div class="error-text">${q.error}</div></div>`;
    }
    return `
      <div class="quote-card">
        <div class="quote-ticker">${q.ticker}</div>
        <div class="quote-price">${formatPrice(q.price)}</div>
        ${formatChange(q.change, q.changePct)}
      </div>`;
  }).join('');
}

function renderLevel(level) {
  const cls = level.structure === 'EQH' ? 'eqh' : 'eql';
  return `
    <div class="level-card ${cls}">
      <div class="level-header">
        <span class="level-type ${cls}">${level.setupType}</span>
        <span class="level-zone">$${level.zoneLow.toFixed(2)} – $${level.zoneHigh.toFixed(2)}</span>
      </div>
      <div class="level-meta">
        ${level.touches} touches · spread $${level.spread?.toFixed(2) ?? '—'} · last ${level.formationTimeEst ?? '—'}
      </div>
    </div>`;
}

function renderSmc(data) {
  const el = $('#smc-levels');
  const blocks = [];

  for (const result of data.results ?? []) {
    if (result.error) {
      blocks.push(`<div style="margin-bottom:16px"><strong>${result.ticker}</strong><div class="error-text">${result.error}</div></div>`);
      continue;
    }

    const levels = [...(result.eql ?? []), ...(result.eqh ?? [])];
    if (!levels.length) {
      blocks.push(`<div style="margin-bottom:16px"><strong>${result.ticker}</strong> <span class="level-meta">— no levels (tolerance $${data.tolerance})</span></div>`);
      continue;
    }

    blocks.push(`<div style="margin-bottom:20px"><div style="font-weight:600;margin-bottom:8px">${result.ticker} <span class="level-meta">· ${result.tradingDate} · ${result.sessionBars} bars</span></div>${levels.map(renderLevel).join('')}</div>`);
  }

  el.innerHTML = blocks.length ? blocks.join('') : '<div class="empty">No SMC data</div>';
}

function renderIv(data) {
  const el = $('#iv-panel');
  if (!data.available) {
    el.innerHTML = '<div class="empty">IV monitor requires Finnhub API key</div>';
    return;
  }

  el.innerHTML = data.items.map((item) => {
    if (item.error) {
      return `<div class="iv-row"><span class="iv-ticker">${item.ticker}</span><span class="error-text">${item.error}</span></div>`;
    }
    const pct = item.ivPercentile ?? 0;
    return `
      <div class="iv-row">
        <span class="iv-ticker">${item.ticker}</span>
        <div class="iv-bar-wrap">
          <div class="iv-bar ${item.signal}" style="width:${Math.min(pct, 100)}%"></div>
        </div>
        <span class="iv-pct">${pct != null ? `${pct}%` : '—'}</span>
      </div>`;
  }).join('');
}

function renderCalendar(data) {
  const el = $('#calendar-panel');
  if (!data.available) {
    el.innerHTML = '<div class="empty">Calendar requires Finnhub API key</div>';
    return;
  }
  if (!data.events?.length) {
    el.innerHTML = '<div class="empty">No high-impact US events this week</div>';
    return;
  }

  el.innerHTML = data.events.slice(0, 8).map((e) => `
    <div class="event-row">
      <div class="event-time">${e.timeEt}</div>
      <div class="event-name">${e.event}</div>
      <div class="event-meta">Impact: ${e.impact} · Est: ${e.estimate ?? 'N/A'} · Prev: ${e.previous ?? 'N/A'}</div>
    </div>`).join('');
}

function renderNews(data) {
  const el = $('#news-panel');
  if (data.error) {
    el.innerHTML = `<div class="error-text">${data.error}</div>`;
    return;
  }
  if (!data.articles?.length) {
    el.innerHTML = '<div class="empty">No recent headlines</div>';
    return;
  }

  el.innerHTML = data.articles.map((a) => `
    <div class="news-row">
      <div class="news-headline"><a href="${a.url}" target="_blank" rel="noopener">${a.headline}</a></div>
      <div class="news-meta">${a.source} · ${relativeTime(a.publishedAt)}</div>
    </div>`).join('');
}

async function loadChart() {
  const ticker = $('#chart-ticker').value.trim().toUpperCase() || 'SPY';
  const tf = $('#chart-timeframe').value;
  const img = $('#chart-img');
  img.style.opacity = '0.4';
  img.src = `/api/chart?ticker=${encodeURIComponent(ticker)}&timeframe=${encodeURIComponent(tf)}&_=${Date.now()}`;
  img.onload = () => { img.style.opacity = '1'; };
  img.onerror = () => {
    img.style.opacity = '1';
    img.alt = 'Chart failed to load — check FINNHUB_API_KEY';
  };
}

async function loadStatus() {
  const status = await api('/api/status');
  const pill = $('#market-status');
  pill.textContent = status.market.open ? 'Market Open' : 'Market Closed';
  pill.className = `market-pill ${status.market.open ? 'open' : 'closed'}`;
  $('#clock').textContent = status.timeEt;
}

async function loadSmc() {
  $('#smc-levels').innerHTML = '<div class="loading">Scanning structure…</div>';
  const data = await api(`/api/smc?timeframe=${smcTimeframe}`);
  renderSmc(data);
}

async function loadAll() {
  try {
    await loadStatus();
    const [quotes, iv, calendar, news] = await Promise.all([
      api('/api/quotes'),
      api('/api/iv'),
      api('/api/calendar'),
      api(`/api/news?ticker=${$('#news-ticker').value}`),
    ]);
    renderQuotes(quotes);
    renderIv(iv);
    renderCalendar(calendar);
    renderNews(news);
    await loadSmc();
  } catch (err) {
    console.error(err);
  }
}

$$('#smc-timeframes .tf-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('#smc-timeframes .tf-pill').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    smcTimeframe = btn.dataset.tf;
    loadSmc().catch(console.error);
  });
});

$('#refresh-all').addEventListener('click', () => loadAll());
$('#load-chart').addEventListener('click', () => loadChart());
$('#news-ticker').addEventListener('change', async () => {
  try {
    const data = await api(`/api/news?ticker=${$('#news-ticker').value}`);
    renderNews(data);
  } catch (err) {
    console.error(err);
  }
});

$$('.sidebar-nav a').forEach((link) => {
  link.addEventListener('click', () => {
    $$('.sidebar-nav a').forEach((l) => l.classList.remove('active'));
    link.classList.add('active');
  });
});

loadAll();
loadChart();
setInterval(loadStatus, 60_000);
setInterval(loadAll, 5 * 60_000);
