const STRATEGY_LABELS = {
  naked_call: 'Naked Call',
  naked_put: 'Naked Put',
  credit_call_spread: 'Credit Call Spread (Bear Call)',
  credit_put_spread: 'Credit Put Spread (Bull Put)',
  debit_call_spread: 'Debit Call Spread (Bull Call)',
  debit_put_spread: 'Debit Put Spread (Bear Put)',
};

export function calculateBreakeven(strategy, params) {
  const {
    strike,
    strike2,
    premium,
    contracts = 1,
  } = params;

  const s1 = Number(strike);
  const s2 = strike2 != null ? Number(strike2) : null;
  const prem = Number(premium);
  const mult = contracts * 100;

  if (!Number.isFinite(s1) || !Number.isFinite(prem) || prem < 0) {
    throw new Error('Invalid strike or premium values');
  }

  let result;

  switch (strategy) {
    case 'naked_call':
      result = {
        breakevens: [s1 + prem],
        maxReward: Infinity,
        maxRisk: prem * mult,
        summary: `Long call at $${s1}. Profit above breakeven; max loss is premium paid ($${(prem * mult).toFixed(2)} per ${contracts} contract(s)).`,
      };
      break;

    case 'naked_put':
      result = {
        breakevens: [s1 - prem],
        maxReward: prem * mult,
        maxRisk: (s1 - prem) * mult,
        summary: `Short put at $${s1}. Max profit is premium collected; assigned below breakeven.`,
      };
      break;

    case 'credit_call_spread':
      if (!Number.isFinite(s2)) throw new Error('Second strike required for spreads');
      result = {
        breakevens: [s1 + prem],
        maxReward: prem * mult,
        maxRisk: (Math.abs(s2 - s1) - prem) * mult,
        summary: `Sell $${s1} call / Buy $${s2} call for $${prem} credit. Max profit if price stays below $${s1}.`,
      };
      break;

    case 'credit_put_spread':
      if (!Number.isFinite(s2)) throw new Error('Second strike required for spreads');
      result = {
        breakevens: [s1 - prem],
        maxReward: prem * mult,
        maxRisk: (Math.abs(s1 - s2) - prem) * mult,
        summary: `Sell $${s1} put / Buy $${s2} put for $${prem} credit. Max profit if price stays above $${s1}.`,
      };
      break;

    case 'debit_call_spread':
      if (!Number.isFinite(s2)) throw new Error('Second strike required for spreads');
      result = {
        breakevens: [s1 + prem],
        maxReward: (Math.abs(s2 - s1) - prem) * mult,
        maxRisk: prem * mult,
        summary: `Buy $${s1} call / Sell $${s2} call for $${prem} debit. Max profit at or above $${s2}.`,
      };
      break;

    case 'debit_put_spread':
      if (!Number.isFinite(s2)) throw new Error('Second strike required for spreads');
      result = {
        breakevens: [s1 - prem],
        maxReward: (Math.abs(s1 - s2) - prem) * mult,
        maxRisk: prem * mult,
        summary: `Buy $${s1} put / Sell $${s2} put for $${prem} debit. Max profit at or below $${s2}.`,
      };
      break;

    default:
      throw new Error(`Unknown strategy: ${strategy}`);
  }

  return {
    strategyLabel: STRATEGY_LABELS[strategy] ?? strategy,
    ...result,
    maxReward: result.maxReward === Infinity ? Infinity : round2(result.maxReward),
    maxRisk: round2(result.maxRisk),
    breakevens: result.breakevens.map(round2),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export const STRATEGY_CHOICES = Object.entries(STRATEGY_LABELS).map(([value, name]) => ({ name, value }));
