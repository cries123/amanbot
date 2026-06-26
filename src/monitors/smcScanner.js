import cron from 'node-cron';
import { config } from '../config.js';
import { scanAllTickersLive } from '../services/smcScanner.js';
import { buildWickLevelEmbed } from '../utils/embeds.js';
import { sendToChannel, editChannelMessage } from '../bot/client.js';

/** @type {Map<string, { messageId: string, channelId: string, swept: boolean }>} */
const trackedAlerts = new Map();

export function startSmcScanner(client, sendToChannelFn) {
  if (!config.channels.smcAlerts) {
    console.warn('[smc-scanner] Skipped — CHANNEL_SMC_ALERTS not set');
    return;
  }

  const channelId = config.channels.smcAlerts;
  const send = sendToChannelFn ?? ((c, ch, payload) => sendToChannel(c, ch, payload));

  cron.schedule(
    config.cron.smcScan,
    async () => {
      if (!isMarketHours()) return;

      const results = await scanAllTickersLive(null, { withSweepDetection: true });

      for (const result of results) {
        for (const signal of result.signals) {
          await handleSignal(client, send, channelId, result, signal);
        }
      }
    },
    { timezone: config.timezone },
  );

  console.log(`[smc-scanner] Auto EQH/EQL alerts → sweep updates enabled (${config.monitors.smcTimeframes.join(', ')})`);
}

function levelKey(result, signal) {
  return `${result.label}-${result.timeframe}-${signal.structure}-${signal.zoneLow.toFixed(2)}-${signal.zoneHigh.toFixed(2)}`;
}

async function handleSignal(client, send, channelId, result, signal) {
  const key = levelKey(result, signal);
  const tracked = trackedAlerts.get(key);
  const embed = buildWickLevelEmbed({
    ticker: result.label,
    level: signal,
    timeframe: result.timeframe,
  });

  if (tracked) {
    if (signal.swept && !tracked.swept) {
      await editChannelMessage(client, tracked.channelId, tracked.messageId, { embeds: [embed] });
      tracked.swept = true;
      trackedAlerts.set(key, tracked);
      console.log(`[smc-scanner] Updated ${key} → swept`);
    }
    return;
  }

  const isNewFormation = !signal.swept && signal.formationIndex >= result.scanEnd - 1;
  const isMissedSweep = signal.swept;

  if (!isNewFormation && !isMissedSweep) return;

  const message = await send(client, channelId, { embeds: [embed] });
  if (!message?.id) return;

  trackedAlerts.set(key, {
    messageId: message.id,
    channelId,
    swept: Boolean(signal.swept),
  });

  console.log(`[smc-scanner] Posted ${key}${signal.swept ? ' (already swept)' : ''}`);
}

function isMarketHours() {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = et.getHours() * 60 + et.getMinutes();
  return minutes >= 9 * 60 + 30 && minutes <= 16 * 60;
}
