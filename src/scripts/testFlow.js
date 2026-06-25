import 'dotenv/config';
import { config } from '../config.js';
import { getOptionsChainSnapshot, scan0DteFlow, get0DteDiagnostics } from '../services/polygon.js';

const ticker = process.argv[2] ?? 'SPY';

if (!config.apis.polygon) {
  console.error('❌ POLYGON_API_KEY missing in .env');
  process.exit(1);
}

console.log(`\n🔍 Testing 0DTE options flow for ${ticker}...\n`);

try {
  const snapshots = await getOptionsChainSnapshot(ticker);
  const diagnostics = get0DteDiagnostics(snapshots);

  console.log(`✅ Polygon connected`);
  console.log(`   Contracts scanned: ${diagnostics.totalContracts}`);
  console.log(`   0DTE today:        ${diagnostics.zeroDteCount}`);
  console.log(`   0DTE with volume:  ${diagnostics.zeroDteWithVolume}`);

  const testSignals = scan0DteFlow(snapshots, {
    minPremium: config.monitors.optionsMinPremium,
    minVoiRatio: config.monitors.optionsMinVoiRatio,
  }, { testMode: true });

  const prodSignals = scan0DteFlow(snapshots, {
    minPremium: config.monitors.optionsMinPremium,
    minVoiRatio: config.monitors.optionsMinVoiRatio,
  });

  console.log(`\n   Test mode signals: ${testSignals.length}`);
  console.log(`   Production signals: ${prodSignals.length}`);

  if (testSignals.length > 0) {
    const top = testSignals[0];
    console.log(`\n   Top signal: ${top.contract}`);
    console.log(`   Premium: $${top.premium.toLocaleString()} | Vol/OI: ${top.voiRatio.toFixed(1)}x`);
    console.log('\n✅ Options flow is working!\n');
  } else if (diagnostics.totalContracts > 0) {
    console.log('\n⚠️  Polygon works but no 0DTE volume right now.');
    console.log('   Try during market hours (9:30 AM – 4:00 PM ET, Mon–Fri).\n');
  } else {
    console.log('\n❌ No options data returned — check your Polygon plan includes options.\n');
    process.exit(1);
  }
} catch (err) {
  console.error(`\n❌ Failed: ${err.message}\n`);
  process.exit(1);
}
