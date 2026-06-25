import 'dotenv/config';
import { config } from '../config.js';
import { scanTickerHistory } from '../services/smcScanner.js';

const ticker = process.argv[2] ?? 'SPY';

console.log(`\n🔍 SMC history test for ${ticker} (last regular session)...\n`);
console.log(`   FVG min gap:        ${config.monitors.fvgMinGapPct}%`);
console.log(`   EQH/EQL tolerance:  ${config.monitors.eqhEqlTolerancePct}%\n`);

try {
  const result = await scanTickerHistory(ticker);

  console.log(`✅ Yahoo Finance connected`);
  console.log(`   Symbol:         ${result.label} (${result.symbol})`);
  console.log(`   Session date:   ${result.tradingDate}`);
  console.log(`   Bars scanned:   ${result.candles.length}`);
  console.log(`   Total signals:  ${result.signals.length}`);

  const byType = result.signals.reduce((acc, s) => {
    acc[s.type] = (acc[s.type] ?? 0) + 1;
    return acc;
  }, {});

  if (Object.keys(byType).length > 0) {
    console.log(`   Breakdown:      ${Object.entries(byType).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }

  if (result.signals.length > 0) {
    for (const s of result.signals.slice(0, 5)) {
      const detail = s.zoneLow != null
        ? `zone $${s.zoneLow}–$${s.zoneHigh}`
        : `level $${s.level}`;
      console.log(`\n   ${s.setupType} @ bar ${s.barTime} (${detail})`);
    }
    console.log('\n✅ SMC scanner is working!\n');
  } else if (result.candles.length > 0) {
    console.log('\n⚠️  Connected but no setups met thresholds on the last session.\n');
  } else {
    console.log('\n❌ No candle data returned.\n');
    process.exit(1);
  }
} catch (err) {
  console.error(`\n❌ Failed: ${err.message}\n`);
  process.exit(1);
}
