import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';

import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export function createRebalanceSuggestionTool(
  portfolioService: PortfolioService
) {
  return tool(
    async ({ userId, targetAllocation }) => {
      try {
        const details = await portfolioService.getDetails({
          userId,
          impersonationId: '',
          withSummary: true
        });

        const holdingsList = Object.values(details.holdings);

        const totalValue =
          details.summary?.currentValueInBaseCurrency ??
          holdingsList.reduce(
            (sum, h) => sum + (h.valueInBaseCurrency ?? 0),
            0
          );

        if (totalValue === 0) {
          return JSON.stringify({
            error: 'Portfolio has zero total value, cannot calculate rebalancing'
          });
        }

        const currentByClass: Record<
          string,
          { value: number; percent: number; holdings: string[] }
        > = {};

        for (const holding of holdingsList) {
          const ac = holding.assetClass ?? 'UNKNOWN';
          if (!currentByClass[ac]) {
            currentByClass[ac] = { value: 0, percent: 0, holdings: [] };
          }
          const holdingValue = holding.valueInBaseCurrency ?? 0;
          currentByClass[ac].value += holdingValue;
          currentByClass[ac].holdings.push(holding.symbol);
        }

        for (const [, data] of Object.entries(currentByClass)) {
          data.percent = +((data.value / totalValue) * 100).toFixed(2);
        }

        const suggestions: {
          assetClass: string;
          currentPercent: number;
          targetPercent: number;
          differencePercent: number;
          dollarAdjustment: number;
          action: 'BUY_MORE' | 'REDUCE' | 'ON_TARGET';
        }[] = [];

        const allClasses = new Set([
          ...Object.keys(currentByClass),
          ...Object.keys(targetAllocation)
        ]);

        for (const assetClass of allClasses) {
          const currentPct = currentByClass[assetClass]?.percent ?? 0;
          const targetPct = targetAllocation[assetClass] ?? 0;
          const diffPct = +(targetPct - currentPct).toFixed(2);
          const dollarAdj = +((diffPct / 100) * totalValue).toFixed(2);

          suggestions.push({
            assetClass,
            currentPercent: currentPct,
            targetPercent: targetPct,
            differencePercent: diffPct,
            dollarAdjustment: dollarAdj,
            action:
              Math.abs(diffPct) < 1
                ? 'ON_TARGET'
                : diffPct > 0
                  ? 'BUY_MORE'
                  : 'REDUCE'
          });
        }

        suggestions.sort(
          (a, b) => Math.abs(b.differencePercent) - Math.abs(a.differencePercent)
        );

        return JSON.stringify({
          totalPortfolioValue: +totalValue.toFixed(2),
          currentAllocation: currentByClass,
          targetAllocation,
          suggestions,
          disclaimer:
            'These are analytical suggestions only, not investment advice. No trades have been or will be executed.'
        });
      } catch (error) {
        return JSON.stringify({
          error: `Failed to generate rebalance suggestions: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    },
    {
      name: 'rebalance_suggestion',
      description:
        'Compare current portfolio allocation against a target asset class allocation and suggest adjustments. Returns specific dollar amounts to buy/sell per asset class. READ-ONLY — no trades are executed.',
      schema: z.object({
        userId: z
          .string()
          .describe(
            'The unique identifier of the user whose portfolio to rebalance'
          ),
        targetAllocation: z
          .record(z.string(), z.number())
          .describe(
            'Target allocation as { assetClass: percentage }. E.g. { "EQUITY": 60, "BOND": 30, "COMMODITY": 10 }. Percentages should sum to 100.'
          )
      })
    }
  );
}
