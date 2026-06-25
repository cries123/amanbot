import 'dotenv/config';
import { config } from '../config.js';
import { scanTickerSmcFlow } from '../services/finnhub.js';

const ticker = process.argv[2] ?? 'SPY';

if (!config.apis.finnhub) {
  console.error('❌ FINNHUB_API_KEY missing in .env');
  process.exit(1);
}

console.log(`\n🔍 Testing EQH/EQL scan for ${ticker} (tolerance $${config.monitors.eqhEqlTolerance})...\n`);

try {
  const { signals, diagnostics, symbol } = await scanTickerSmcFlow(ticker, {
    timeframe: '5m',
    tolerance: config.monitors.eqhEqlTolerance,
  });

  console.log(`✅ Finnhub connected`);
  console.log(`   Symbol:            ${symbol}`);
  console.log(`   Bars scanned:      ${diagnostics.bars}`);
  console.log(`   Swing highs/lows:  ${diagnostics.swingHighs} / ${diagnostics.swingLows}`);
  console.log(`   EQH clusters:      ${diagnostics.eqhClusters}`);
  console.log(`   EQL clusters:      ${diagnostics.eqlClusters}`);
  console.log(`   Total signals:     ${signals.length}`);
  console.log(`   Sweeps:            ${signals.filter((s) => s.swept).length}`);

  if (signals.length > 0) {
    for (const s of signals.slice(0, 3)) {
      console.log(`\n   ${s.type} @ $${s.level.toFixed(2)} (${s.touches} touches, spread $${s.spread.toFixed(2)})`);
    }
    console.log('\n✅ EQH/EQL scan is working!\n');
  } else if (diagnostics.bars > 0) {
    console.log('\n⚠️  Connected but no EQH/EQL clusters within tolerance right now.');
    console.log('   Try during market hours or a different ticker.\n');
  } else {
    console.log('\n❌ No candle data returned.\n');
    process.exit(1);
  }
} catch (err) {
  console.error(`\n❌ Failed: ${err.message}\n`);
  process.exit(1);
}
