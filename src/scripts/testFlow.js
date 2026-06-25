import 'dotenv/config';
import { config } from '../config.js';
import { scanTickerVolumeFlow } from '../services/finnhub.js';

const ticker = process.argv[2] ?? 'SPY';

if (!config.apis.finnhub) {
  console.error('❌ FINNHUB_API_KEY missing in .env');
  process.exit(1);
}

console.log(`\n🔍 Testing Finnhub volume flow for ${ticker}...\n`);

try {
  const thresholds = {
    minPremium: config.monitors.optionsMinPremium,
    minVoiRatio: config.monitors.optionsMinVoiRatio,
  };

  const { signals, diagnostics, symbol } = await scanTickerVolumeFlow(ticker, thresholds, { testMode: true });
  const prodSignals = (await scanTickerVolumeFlow(ticker, thresholds)).signals;

  console.log(`✅ Finnhub connected`);
  console.log(`   Symbol scanned:    ${symbol}`);
  console.log(`   Bars scanned:      ${diagnostics.bars}`);
  console.log(`   Bars with volume:  ${diagnostics.barsWithVolume}`);
  console.log(`\n   Test mode signals: ${signals.length}`);
  console.log(`   Production signals: ${prodSignals.length}`);

  if (signals.length > 0) {
    const top = signals[0];
    console.log(`\n   Top signal: $${top.dollarVolume.toLocaleString()} dollar volume`);
    console.log(`   Vol ratio: ${top.volRatio.toFixed(1)}x | ${top.direction}`);
    console.log('\n✅ Volume flow is working!\n');
  } else if (diagnostics.bars > 0) {
    console.log('\n⚠️  Finnhub works but no unusual volume right now.');
    console.log('   Try during market hours (9:30 AM – 4 PM ET, Mon–Fri).\n');
  } else {
    console.log('\n❌ No candle data returned.\n');
    process.exit(1);
  }
} catch (err) {
  console.error(`\n❌ Failed: ${err.message}\n`);
  process.exit(1);
}
