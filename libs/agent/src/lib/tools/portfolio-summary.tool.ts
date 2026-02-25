import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';

import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export function createPortfolioSummaryTool(
  portfolioService: PortfolioService
) {
  return tool(
    async ({ userId }) => {
      try {
        const [details, performance] = await Promise.all([
          portfolioService.getDetails({
            userId,
            impersonationId: '',
            withSummary: true
          }),
          portfolioService.getPerformance({
            userId,
            impersonationId: '',
            dateRange: 'max'
          })
        ]);

        const holdings = Object.values(details.holdings)
          .sort((a, b) => b.allocationInPercentage - a.allocationInPercentage)
          .map((h) => ({
            symbol: h.symbol,
            name: h.name,
            allocationPercent: +(h.allocationInPercentage * 100).toFixed(2),
            currentValue: h.investment + h.netPerformance,
            quantity: h.quantity,
            currency: h.currency,
            assetClass: h.assetClass ?? 'UNKNOWN',
            netPerformancePercent: +(h.netPerformancePercent * 100).toFixed(2)
          }));

        const { performance: perf } = performance;

        return JSON.stringify({
          totalValue: perf.currentValueInBaseCurrency,
          totalInvestment: perf.totalInvestment,
          netPerformance: perf.netPerformance,
          netPerformancePercent: +(
            perf.netPerformancePercentage * 100
          ).toFixed(2),
          annualizedReturn: perf.annualizedPerformancePercent
            ? +(perf.annualizedPerformancePercent * 100).toFixed(2)
            : null,
          holdingsCount: holdings.length,
          holdings: holdings.slice(0, 20),
          summary: details.summary ?? null,
          hasErrors: details.hasErrors
        });
      } catch (error) {
        return JSON.stringify({
          error: `Failed to fetch portfolio summary: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    },
    {
      name: 'portfolio_summary',
      description:
        'Get a comprehensive summary of a user portfolio including total value, all holdings with allocation percentages, and performance metrics. Use this when asked about portfolio value, holdings, positions, or overall performance.',
      schema: z.object({
        userId: z.string().describe('The unique identifier of the user whose portfolio to summarize')
      })
    }
  );
}
