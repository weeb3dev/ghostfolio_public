import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';

import { tool } from '@langchain/core/tools';
import { DataSource } from '@prisma/client';
import { z } from 'zod';

export function createAssetLookupTool(
  dataProviderService: DataProviderService
) {
  return tool(
    async ({ symbol, dataSource }) => {
      try {
        const identifier = {
          dataSource: dataSource as DataSource,
          symbol
        };

        const now = new Date();
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(now.getFullYear() - 1);

        const [quotes, historical, profiles] = await Promise.all([
          dataProviderService.getQuotes({ items: [identifier] }),
          dataProviderService.getHistorical(
            [identifier],
            'day',
            oneYearAgo,
            now
          ),
          dataProviderService.getAssetProfiles([identifier])
        ]);

        const quote = quotes[symbol];
        const history = historical[symbol] ?? {};
        const profile = profiles[symbol];

        const prices = Object.values(history).map((d) => d.marketPrice);
        const high52w = prices.length > 0 ? Math.max(...prices) : null;
        const low52w = prices.length > 0 ? Math.min(...prices) : null;

        return JSON.stringify({
          symbol,
          dataSource,
          currentPrice: quote?.marketPrice ?? null,
          currency: quote?.currency ?? profile?.currency ?? null,
          marketState: quote?.marketState ?? null,
          fiftyTwoWeekHigh: high52w,
          fiftyTwoWeekLow: low52w,
          name: profile?.name ?? null,
          assetClass: profile?.assetClass ?? null,
          assetSubClass: profile?.assetSubClass ?? null,
          sectors: Array.isArray(profile?.sectors)
            ? (profile.sectors as { name: string; weight: number }[]).map(
                (s) => ({ name: s.name, weight: s.weight })
              )
            : [],
          countries: Array.isArray(profile?.countries)
            ? (
                profile.countries as {
                  code: string;
                  name: string;
                  weight: number;
                }[]
              ).map((c) => ({
                code: c.code,
                name: c.name,
                weight: c.weight
              }))
            : []
        });
      } catch (error) {
        return JSON.stringify({
          error: `Failed to look up asset ${symbol}: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    },
    {
      name: 'asset_lookup',
      description:
        'Look up current price, 52-week high/low, and basic info for a specific stock, ETF, or other asset by its ticker symbol. Use this when asked about a specific asset price or details.',
      schema: z.object({
        symbol: z
          .string()
          .describe('The ticker symbol to look up (e.g. AAPL, MSFT, VOO)'),
        dataSource: z
          .string()
          .default('YAHOO')
          .describe(
            'The data source to use for the lookup (default: YAHOO)'
          )
      })
    }
  );
}
