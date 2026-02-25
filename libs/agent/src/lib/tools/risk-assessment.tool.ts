import { PortfolioService } from '@ghostfolio/api/app/portfolio/portfolio.service';

import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const CONCENTRATION_THRESHOLD = 0.25;

export function createRiskAssessmentTool(
  portfolioService: PortfolioService
) {
  return tool(
    async ({ userId }) => {
      try {
        const details = await portfolioService.getDetails({
          userId,
          impersonationId: '',
          withSummary: true,
          withMarkets: true
        });

        const holdingsList = Object.values(details.holdings);
        const riskFlags: string[] = [];

        const concentrated = holdingsList.filter(
          (h) => h.allocationInPercentage > CONCENTRATION_THRESHOLD
        );
        if (concentrated.length > 0) {
          for (const h of concentrated) {
            riskFlags.push(
              `High concentration: ${h.symbol} at ${(h.allocationInPercentage * 100).toFixed(1)}% of portfolio`
            );
          }
        }

        const sectorAllocation: Record<string, number> = {};
        for (const holding of holdingsList) {
          for (const sector of holding.sectors ?? []) {
            const weighted = sector.weight * holding.allocationInPercentage;
            sectorAllocation[sector.name] =
              (sectorAllocation[sector.name] ?? 0) + weighted;
          }
        }

        const topSectors = Object.entries(sectorAllocation)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([name, weight]) => ({
            name,
            allocationPercent: +(weight * 100).toFixed(2)
          }));

        const dominantSector = topSectors[0];
        if (dominantSector && dominantSector.allocationPercent > 40) {
          riskFlags.push(
            `Sector concentration: ${dominantSector.name} at ${dominantSector.allocationPercent}%`
          );
        }

        const countryAllocation: Record<
          string,
          { name: string; weight: number }
        > = {};
        for (const holding of holdingsList) {
          for (const country of holding.countries ?? []) {
            const weighted = country.weight * holding.allocationInPercentage;
            if (!countryAllocation[country.code]) {
              countryAllocation[country.code] = {
                name: country.name,
                weight: 0
              };
            }
            countryAllocation[country.code].weight += weighted;
          }
        }

        const topCountries = Object.entries(countryAllocation)
          .sort(([, a], [, b]) => b.weight - a.weight)
          .slice(0, 10)
          .map(([code, { name, weight }]) => ({
            code,
            name,
            allocationPercent: +(weight * 100).toFixed(2)
          }));

        const topCountry = topCountries[0];
        if (topCountry && topCountry.allocationPercent > 70) {
          riskFlags.push(
            `Geographic concentration: ${topCountry.name} at ${topCountry.allocationPercent}%`
          );
        }

        const assetClassAllocation: Record<string, number> = {};
        for (const holding of holdingsList) {
          const ac = holding.assetClass ?? 'UNKNOWN';
          assetClassAllocation[ac] =
            (assetClassAllocation[ac] ?? 0) + holding.allocationInPercentage;
        }

        const assetClasses = Object.entries(assetClassAllocation)
          .sort(([, a], [, b]) => b - a)
          .map(([name, weight]) => ({
            name,
            allocationPercent: +(weight * 100).toFixed(2)
          }));

        if (holdingsList.length < 5) {
          riskFlags.push(
            `Low diversification: only ${holdingsList.length} holdings`
          );
        }

        return JSON.stringify({
          holdingsCount: holdingsList.length,
          concentratedPositions: concentrated.map((h) => ({
            symbol: h.symbol,
            name: h.name,
            allocationPercent: +(h.allocationInPercentage * 100).toFixed(2)
          })),
          sectorAllocation: topSectors,
          countryAllocation: topCountries,
          assetClassAllocation: assetClasses,
          riskFlags,
          riskLevel:
            riskFlags.length === 0
              ? 'LOW'
              : riskFlags.length <= 2
                ? 'MODERATE'
                : 'HIGH'
        });
      } catch (error) {
        return JSON.stringify({
          error: `Failed to assess risk: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    },
    {
      name: 'risk_assessment',
      description:
        'Analyze the risk profile of a user portfolio. Checks for concentration risk (any holding >25%), sector allocation, geographic diversification, and asset class balance. Returns specific risk flags.',
      schema: z.object({
        userId: z
          .string()
          .describe(
            'The unique identifier of the user whose portfolio risk to assess'
          )
      })
    }
  );
}
