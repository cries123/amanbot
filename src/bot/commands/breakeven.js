import { SlashCommandBuilder } from 'discord.js';
import { calculateBreakeven, STRATEGY_CHOICES } from '../../utils/breakeven.js';
import { buildBreakevenEmbed } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('breakeven')
  .setDescription('Calculate breakeven, max reward, and max risk for an options strategy')
  .addStringOption((opt) =>
    opt.setName('strategy').setDescription('Options strategy').setRequired(true).addChoices(...STRATEGY_CHOICES),
  )
  .addNumberOption((opt) =>
    opt.setName('strike').setDescription('Primary strike price').setRequired(true).setMinValue(0.01),
  )
  .addNumberOption((opt) =>
    opt.setName('premium').setDescription('Premium per share (debit paid or credit received)').setRequired(true).setMinValue(0),
  )
  .addNumberOption((opt) =>
    opt.setName('strike2').setDescription('Second strike (required for spreads)').setMinValue(0.01),
  )
  .addIntegerOption((opt) =>
    opt.setName('contracts').setDescription('Number of contracts').setMinValue(1).setMaxValue(100),
  );

export async function execute(interaction) {
  const strategy = interaction.options.getString('strategy');
  const strike = interaction.options.getNumber('strike');
  const premium = interaction.options.getNumber('premium');
  const strike2 = interaction.options.getNumber('strike2');
  const contracts = interaction.options.getInteger('contracts') ?? 1;

  const spreadStrategies = ['credit_call_spread', 'credit_put_spread', 'debit_call_spread', 'debit_put_spread'];
  if (spreadStrategies.includes(strategy) && strike2 == null) {
    await interaction.reply({ content: 'Spread strategies require a second strike (`strike2`).', ephemeral: true });
    return;
  }

  try {
    const result = calculateBreakeven(strategy, { strike, strike2, premium, contracts });
    const embed = buildBreakevenEmbed(result);
    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    await interaction.reply({ content: `Calculation error: ${err.message}`, ephemeral: true });
  }
}
