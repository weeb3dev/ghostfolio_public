import { OrderService } from '@ghostfolio/api/app/order/order.service';

import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export function createTransactionAnalysisTool(orderService: OrderService) {
  return tool(
    async ({ userId, startDate, endDate, userCurrency }) => {
      try {
        const { activities, count } = await orderService.getOrders({
          userId,
          userCurrency,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          withExcludedAccountsAndActivities: false
        });

        let totalFees = 0;
        let totalBuyValue = 0;
        let totalSellValue = 0;
        let buyCount = 0;
        let sellCount = 0;
        const symbolCounts: Record<string, number> = {};

        for (const activity of activities) {
          totalFees += activity.feeInBaseCurrency ?? 0;

          if (activity.type === 'BUY') {
            buyCount++;
            totalBuyValue += activity.valueInBaseCurrency ?? 0;
          } else if (activity.type === 'SELL') {
            sellCount++;
            totalSellValue += activity.valueInBaseCurrency ?? 0;
          }

          const sym = activity.SymbolProfile?.symbol ?? 'UNKNOWN';
          symbolCounts[sym] = (symbolCounts[sym] ?? 0) + 1;
        }

        const mostTraded = Object.entries(symbolCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([symbol, tradeCount]) => ({ symbol, tradeCount }));

        return JSON.stringify({
          totalTrades: count,
          buyCount,
          sellCount,
          otherCount: count - buyCount - sellCount,
          totalBuyValue: +totalBuyValue.toFixed(2),
          totalSellValue: +totalSellValue.toFixed(2),
          totalFees: +totalFees.toFixed(2),
          mostTradedSymbols: mostTraded,
          dateRange: {
            from: startDate ?? 'all time',
            to: endDate ?? 'present'
          }
        });
      } catch (error) {
        return JSON.stringify({
          error: `Failed to analyze transactions: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    },
    {
      name: 'transaction_analysis',
      description:
        'Analyze trading activity for a user portfolio. Returns trade count, buy/sell breakdown, total fees, and most traded symbols. Supports optional date range filtering.',
      schema: z.object({
        userId: z
          .string()
          .describe('The unique identifier of the user whose transactions to analyze'),
        startDate: z
          .string()
          .optional()
          .describe('Start date for filtering (ISO 8601 format, e.g. 2024-01-01)'),
        endDate: z
          .string()
          .optional()
          .describe('End date for filtering (ISO 8601 format, e.g. 2024-12-31)'),
        userCurrency: z
          .string()
          .default('USD')
          .describe('Base currency for value calculations (default: USD)')
      })
    }
  );
}
