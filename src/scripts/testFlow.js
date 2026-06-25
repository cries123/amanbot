import 'dotenv/config';
import { config } from '../config.js';
import { scanTickerLive } from '../services/smcScanner.js';

const ticker = process.argv[2] ?? 'SPY';

console.log(`\n🔍 Testing live SMC scan for ${ticker}...\n`);
console.log(`   EQH/EQL tolerance: $${config.monitors.eqhEqlTolerance}`);
console.log(`   FVG min gap:       ${config.monitors.fvgMinGapPct}%\n`);

try {
  const { signals, candles, label } = await scanTickerLive(ticker);

  console.log(`✅ Yahoo Finance connected`);
  console.log(`   Symbol:            ${label}`);
  console.log(`   Closed bars:       ${candles.length}`);
  console.log(`   Live signals:      ${signals.length}`);

  if (signals.length > 0) {
    for (const s of signals) {
      console.log(`\n   ${s.setupType} (${s.type})`);
    }
    console.log('\n✅ Live SMC scan is working!\n');
  } else if (candles.length > 0) {
    console.log('\n⚠️  Connected but no new setups on the latest closed 5m bar.\n');
  } else {
    console.log('\n❌ No candle data returned.\n');
    process.exit(1);
  }
} catch (err) {
  console.error(`\n❌ Failed: ${err.message}\n`);
  process.exit(1);
}
