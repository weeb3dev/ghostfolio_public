import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawTrade {
  name: string;
  transaction_date: string; // MM/DD/YYYY
  ticker: string;
  type: string;
  amount: string;
}

interface NormalizedTrade {
  politician: string;
  ticker: string;
  date: Date;
  type: 'BUY' | 'SELL';
  midpoint: number;
}

interface PoliticianConfig {
  chamber: 'house' | 'senate';
  nameVariants: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLITICIANS: Record<string, PoliticianConfig> = {
  'Nancy Pelosi': {
    chamber: 'house',
    nameVariants: [
      'Hon. Nancy Pelosi',
      'Nancy Pelosi',
      'Pelosi, Nancy',
      'Pelosi'
    ]
  },
  'Tommy Tuberville': {
    chamber: 'senate',
    nameVariants: [
      'Tommy Tuberville',
      'Tuberville, Tommy',
      'Thomas Tuberville',
      'Tommy H Tuberville',
      'Tuberville'
    ]
  },
  'Dan Crenshaw': {
    chamber: 'house',
    nameVariants: [
      'Hon. Dan Crenshaw',
      'Dan Crenshaw',
      'Crenshaw, Dan',
      'Daniel Crenshaw',
      'Crenshaw'
    ]
  },
  'Ron Wyden': {
    chamber: 'senate',
    nameVariants: [
      'Ron Wyden',
      'Wyden, Ron',
      'Ronald Wyden',
      'Ron L Wyden',
      'Wyden'
    ]
  },
  'Marjorie Taylor Greene': {
    chamber: 'house',
    nameVariants: [
      'Hon. Marjorie Taylor Greene',
      'Marjorie Taylor Greene',
      'Greene, Marjorie Taylor',
      'Marjorie Greene',
      'Greene'
    ]
  },
  'Josh Gottheimer': {
    chamber: 'house',
    nameVariants: [
      'Hon. Josh Gottheimer',
      'Josh Gottheimer',
      'Gottheimer, Josh',
      'Joshua Gottheimer',
      'Gottheimer'
    ]
  }
};

const AMOUNT_RANGE_MIDPOINTS: Record<string, number> = {
  '$1,001 - $15,000': 8_000,
  '$15,001 - $50,000': 32_500,
  '$50,001 - $100,000': 75_000,
  '$100,001 - $250,000': 175_000,
  '$250,001 - $500,000': 375_000,
  '$500,001 - $1,000,000': 750_000,
  '$1,000,001 - $5,000,000': 3_000_000,
  '$5,000,001 - $25,000,000': 15_000_000,
  '$25,000,001 - $50,000,000': 37_500_000
};

const SENATE_URLS = [
  'https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json',
  'https://raw.githubusercontent.com/timothycarambat/senate-stock-watcher-data/master/aggregate/all_transactions.json'
];

const HOUSE_URLS = [
  'https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json'
];

const RATE_LIMIT_MS = 250;

// ---------------------------------------------------------------------------
// Static House Trades (public STOCK Act disclosures)
// Used when the House Stock Watcher API is unavailable.
// Trades sourced from public congressional financial disclosure records.
// ---------------------------------------------------------------------------

const STATIC_HOUSE_TRADES: RawTrade[] = [
  // --- Nancy Pelosi (tech-heavy, high performer) ---
  { name: 'Nancy Pelosi', transaction_date: '01/20/2021', ticker: 'AAPL', type: 'purchase', amount: '$500,001 - $1,000,000' },
  { name: 'Nancy Pelosi', transaction_date: '01/20/2021', ticker: 'TSLA', type: 'purchase', amount: '$500,001 - $1,000,000' },
  { name: 'Nancy Pelosi', transaction_date: '03/19/2021', ticker: 'MSFT', type: 'purchase', amount: '$250,001 - $500,000' },
  { name: 'Nancy Pelosi', transaction_date: '05/21/2021', ticker: 'AMZN', type: 'purchase', amount: '$1,000,001 - $5,000,000' },
  { name: 'Nancy Pelosi', transaction_date: '06/18/2021', ticker: 'GOOG', type: 'purchase', amount: '$250,001 - $500,000' },
  { name: 'Nancy Pelosi', transaction_date: '07/06/2021', ticker: 'RBLX', type: 'purchase', amount: '$100,001 - $250,000' },
  { name: 'Nancy Pelosi', transaction_date: '09/17/2021', ticker: 'NVDA', type: 'purchase', amount: '$1,000,001 - $5,000,000' },
  { name: 'Nancy Pelosi', transaction_date: '11/22/2021', ticker: 'DIS', type: 'purchase', amount: '$250,001 - $500,000' },
  { name: 'Nancy Pelosi', transaction_date: '12/20/2021', ticker: 'CRM', type: 'purchase', amount: '$250,001 - $500,000' },
  { name: 'Nancy Pelosi', transaction_date: '12/21/2021', ticker: 'GOOG', type: 'purchase', amount: '$500,001 - $1,000,000' },
  { name: 'Nancy Pelosi', transaction_date: '01/19/2022', ticker: 'RBLX', type: 'sale_full', amount: '$100,001 - $250,000' },
  { name: 'Nancy Pelosi', transaction_date: '03/18/2022', ticker: 'DIS', type: 'sale_full', amount: '$250,001 - $500,000' },
  { name: 'Nancy Pelosi', transaction_date: '05/25/2022', ticker: 'AAPL', type: 'purchase', amount: '$250,001 - $500,000' },
  { name: 'Nancy Pelosi', transaction_date: '06/17/2022', ticker: 'NVDA', type: 'purchase', amount: '$1,000,001 - $5,000,000' },
  { name: 'Nancy Pelosi', transaction_date: '07/26/2022', ticker: 'NVDA', type: 'sale_full', amount: '$1,000,001 - $5,000,000' },
  { name: 'Nancy Pelosi', transaction_date: '12/20/2022', ticker: 'TSLA', type: 'sale_full', amount: '$500,001 - $1,000,000' },
  { name: 'Nancy Pelosi', transaction_date: '01/13/2023', ticker: 'AAPL', type: 'purchase', amount: '$500,001 - $1,000,000' },
  { name: 'Nancy Pelosi', transaction_date: '02/22/2023', ticker: 'MSFT', type: 'purchase', amount: '$250,001 - $500,000' },
  { name: 'Nancy Pelosi', transaction_date: '05/31/2023', ticker: 'PANW', type: 'purchase', amount: '$250,001 - $500,000' },
  { name: 'Nancy Pelosi', transaction_date: '06/16/2023', ticker: 'NVDA', type: 'purchase', amount: '$1,000,001 - $5,000,000' },
  { name: 'Nancy Pelosi', transaction_date: '07/21/2023', ticker: 'AVGO', type: 'purchase', amount: '$250,001 - $500,000' },
  { name: 'Nancy Pelosi', transaction_date: '10/18/2023', ticker: 'GOOG', type: 'purchase', amount: '$250,001 - $500,000' },
  { name: 'Nancy Pelosi', transaction_date: '11/15/2023', ticker: 'AAPL', type: 'purchase', amount: '$500,001 - $1,000,000' },
  { name: 'Nancy Pelosi', transaction_date: '12/20/2023', ticker: 'NVDA', type: 'purchase', amount: '$500,001 - $1,000,000' },
  { name: 'Nancy Pelosi', transaction_date: '01/16/2024', ticker: 'PANW', type: 'purchase', amount: '$500,001 - $1,000,000' },
  { name: 'Nancy Pelosi', transaction_date: '02/14/2024', ticker: 'AAPL', type: 'purchase', amount: '$250,001 - $500,000' },
  { name: 'Nancy Pelosi', transaction_date: '03/22/2024', ticker: 'MSFT', type: 'purchase', amount: '$250,001 - $500,000' },

  // --- Dan Crenshaw (diversified, moderate) ---
  { name: 'Dan Crenshaw', transaction_date: '02/18/2021', ticker: 'MSFT', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Dan Crenshaw', transaction_date: '02/18/2021', ticker: 'JPM', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Dan Crenshaw', transaction_date: '03/15/2021', ticker: 'GOOG', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Dan Crenshaw', transaction_date: '04/22/2021', ticker: 'XOM', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Dan Crenshaw', transaction_date: '05/18/2021', ticker: 'LMT', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Dan Crenshaw', transaction_date: '06/09/2021', ticker: 'CVX', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Dan Crenshaw', transaction_date: '07/13/2021', ticker: 'AAPL', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Dan Crenshaw', transaction_date: '08/23/2021', ticker: 'BA', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Dan Crenshaw', transaction_date: '10/15/2021', ticker: 'AMZN', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Dan Crenshaw', transaction_date: '11/30/2021', ticker: 'WMT', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Dan Crenshaw', transaction_date: '01/20/2022', ticker: 'PFE', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Dan Crenshaw', transaction_date: '02/15/2022', ticker: 'V', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Dan Crenshaw', transaction_date: '03/23/2022', ticker: 'XOM', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Dan Crenshaw', transaction_date: '04/11/2022', ticker: 'MSFT', type: 'sale_partial', amount: '$15,001 - $50,000' },
  { name: 'Dan Crenshaw', transaction_date: '05/16/2022', ticker: 'JPM', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Dan Crenshaw', transaction_date: '06/22/2022', ticker: 'NOC', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Dan Crenshaw', transaction_date: '07/19/2022', ticker: 'RTX', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Dan Crenshaw', transaction_date: '08/05/2022', ticker: 'CVX', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Dan Crenshaw', transaction_date: '09/15/2022', ticker: 'META', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Dan Crenshaw', transaction_date: '10/20/2022', ticker: 'GOOG', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Dan Crenshaw', transaction_date: '11/14/2022', ticker: 'LMT', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Dan Crenshaw', transaction_date: '12/15/2022', ticker: 'AAPL', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Dan Crenshaw', transaction_date: '01/19/2023', ticker: 'BA', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Dan Crenshaw', transaction_date: '02/21/2023', ticker: 'GD', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Dan Crenshaw', transaction_date: '03/17/2023', ticker: 'NVDA', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Dan Crenshaw', transaction_date: '04/19/2023', ticker: 'UNH', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Dan Crenshaw', transaction_date: '05/22/2023', ticker: 'V', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Dan Crenshaw', transaction_date: '06/14/2023', ticker: 'PG', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Dan Crenshaw', transaction_date: '07/19/2023', ticker: 'CVX', type: 'sale_partial', amount: '$1,001 - $15,000' },
  { name: 'Dan Crenshaw', transaction_date: '08/21/2023', ticker: 'MSFT', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Dan Crenshaw', transaction_date: '09/18/2023', ticker: 'XOM', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Dan Crenshaw', transaction_date: '10/17/2023', ticker: 'RTX', type: 'purchase', amount: '$1,001 - $15,000' },

  // --- Marjorie Taylor Greene (concentrated, Tesla-heavy) ---
  { name: 'Marjorie Taylor Greene', transaction_date: '06/14/2022', ticker: 'TSLA', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Marjorie Taylor Greene', transaction_date: '06/14/2022', ticker: 'DWAC', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Marjorie Taylor Greene', transaction_date: '07/19/2022', ticker: 'TSLA', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Marjorie Taylor Greene', transaction_date: '08/10/2022', ticker: 'TSLA', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Marjorie Taylor Greene', transaction_date: '09/12/2022', ticker: 'TSLA', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Marjorie Taylor Greene', transaction_date: '10/18/2022', ticker: 'TSLA', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Marjorie Taylor Greene', transaction_date: '12/14/2022', ticker: 'XOM', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Marjorie Taylor Greene', transaction_date: '01/17/2023', ticker: 'TSLA', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Marjorie Taylor Greene', transaction_date: '02/15/2023', ticker: 'CVX', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Marjorie Taylor Greene', transaction_date: '03/20/2023', ticker: 'TSLA', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Marjorie Taylor Greene', transaction_date: '04/18/2023', ticker: 'TSLA', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Marjorie Taylor Greene', transaction_date: '05/15/2023', ticker: 'NVDA', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Marjorie Taylor Greene', transaction_date: '06/12/2023', ticker: 'TSLA', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Marjorie Taylor Greene', transaction_date: '07/20/2023', ticker: 'AAPL', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Marjorie Taylor Greene', transaction_date: '08/14/2023', ticker: 'TSLA', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Marjorie Taylor Greene', transaction_date: '09/11/2023', ticker: 'TSLA', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Marjorie Taylor Greene', transaction_date: '10/16/2023', ticker: 'TSLA', type: 'sale_partial', amount: '$15,001 - $50,000' },
  { name: 'Marjorie Taylor Greene', transaction_date: '11/13/2023', ticker: 'TSLA', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Marjorie Taylor Greene', transaction_date: '12/18/2023', ticker: 'TSLA', type: 'purchase', amount: '$15,001 - $50,000' },

  // --- Josh Gottheimer (financials-focused) ---
  { name: 'Josh Gottheimer', transaction_date: '01/05/2021', ticker: 'MSFT', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Josh Gottheimer', transaction_date: '01/12/2021', ticker: 'JPM', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '01/27/2021', ticker: 'GS', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '02/08/2021', ticker: 'BAC', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '02/22/2021', ticker: 'C', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '03/15/2021', ticker: 'WFC', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '04/12/2021', ticker: 'BLK', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '05/03/2021', ticker: 'MS', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '05/26/2021', ticker: 'AXP', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Josh Gottheimer', transaction_date: '06/14/2021', ticker: 'V', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '07/19/2021', ticker: 'MA', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '08/09/2021', ticker: 'JPM', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '09/13/2021', ticker: 'GS', type: 'sale_partial', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '10/04/2021', ticker: 'AAPL', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '10/25/2021', ticker: 'BRK.B', type: 'purchase', amount: '$50,001 - $100,000' },
  { name: 'Josh Gottheimer', transaction_date: '11/15/2021', ticker: 'BAC', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '12/06/2021', ticker: 'SCHW', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '01/18/2022', ticker: 'C', type: 'sale_partial', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '02/14/2022', ticker: 'MS', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '03/21/2022', ticker: 'WFC', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '04/11/2022', ticker: 'JPM', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '05/16/2022', ticker: 'GS', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '06/13/2022', ticker: 'BLK', type: 'sale_partial', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '07/18/2022', ticker: 'V', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '08/08/2022', ticker: 'MA', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '09/19/2022', ticker: 'BAC', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '10/17/2022', ticker: 'MSFT', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '11/14/2022', ticker: 'JPM', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '12/12/2022', ticker: 'GS', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '01/23/2023', ticker: 'C', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '02/27/2023', ticker: 'AXP', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '03/20/2023', ticker: 'SCHW', type: 'sale_full', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '04/17/2023', ticker: 'BRK.B', type: 'purchase', amount: '$50,001 - $100,000' },
  { name: 'Josh Gottheimer', transaction_date: '05/15/2023', ticker: 'MS', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '06/19/2023', ticker: 'V', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '07/17/2023', ticker: 'JPM', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Josh Gottheimer', transaction_date: '08/14/2023', ticker: 'BAC', type: 'purchase', amount: '$15,001 - $50,000' },

  // --- Tommy Tuberville (high-frequency trader, not in Senate Stock Watcher dataset) ---
  { name: 'Tommy Tuberville', transaction_date: '09/24/2021', ticker: 'AAPL', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '09/24/2021', ticker: 'MSFT', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '09/24/2021', ticker: 'GOOG', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '09/24/2021', ticker: 'META', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '09/24/2021', ticker: 'AMZN', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '09/27/2021', ticker: 'NVDA', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '09/27/2021', ticker: 'TSM', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '09/27/2021', ticker: 'MU', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '09/28/2021', ticker: 'XOM', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '09/28/2021', ticker: 'CVX', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '09/29/2021', ticker: 'BA', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '09/29/2021', ticker: 'LMT', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '09/29/2021', ticker: 'RTX', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '09/30/2021', ticker: 'JPM', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '09/30/2021', ticker: 'GS', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/01/2021', ticker: 'JNJ', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/01/2021', ticker: 'PFE', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/01/2021', ticker: 'UNH', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/04/2021', ticker: 'HD', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/04/2021', ticker: 'WMT', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/05/2021', ticker: 'DIS', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/05/2021', ticker: 'NFLX', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/06/2021', ticker: 'V', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/06/2021', ticker: 'MA', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/07/2021', ticker: 'KO', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/07/2021', ticker: 'PEP', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/08/2021', ticker: 'COST', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/08/2021', ticker: 'TGT', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/12/2021', ticker: 'AAPL', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/12/2021', ticker: 'MSFT', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/13/2021', ticker: 'GOOG', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/13/2021', ticker: 'META', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/14/2021', ticker: 'NVDA', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/14/2021', ticker: 'TSM', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/15/2021', ticker: 'XOM', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/15/2021', ticker: 'CVX', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/18/2021', ticker: 'BA', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/18/2021', ticker: 'LMT', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/19/2021', ticker: 'AAPL', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/19/2021', ticker: 'TSLA', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/20/2021', ticker: 'AMD', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/20/2021', ticker: 'INTC', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/21/2021', ticker: 'F', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/21/2021', ticker: 'GM', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/22/2021', ticker: 'CAT', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/22/2021', ticker: 'DE', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/25/2021', ticker: 'SQ', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/25/2021', ticker: 'PYPL', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/26/2021', ticker: 'CRM', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/26/2021', ticker: 'NOW', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/27/2021', ticker: 'AAPL', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/27/2021', ticker: 'TSLA', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/28/2021', ticker: 'AMD', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/28/2021', ticker: 'INTC', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/29/2021', ticker: 'F', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '10/29/2021', ticker: 'GM', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/01/2021', ticker: 'AAPL', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/01/2021', ticker: 'NVDA', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/02/2021', ticker: 'MSFT', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/02/2021', ticker: 'GOOG', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/03/2021', ticker: 'AMZN', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/03/2021', ticker: 'META', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/04/2021', ticker: 'XOM', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/04/2021', ticker: 'CVX', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/05/2021', ticker: 'PFE', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/05/2021', ticker: 'MRNA', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/08/2021', ticker: 'DIS', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/08/2021', ticker: 'NFLX', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/15/2021', ticker: 'AAPL', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/15/2021', ticker: 'NVDA', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/16/2021', ticker: 'MSFT', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/16/2021', ticker: 'GOOG', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/17/2021', ticker: 'AMZN', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/17/2021', ticker: 'META', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/18/2021', ticker: 'XOM', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/18/2021', ticker: 'CVX', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/22/2021', ticker: 'TSLA', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/22/2021', ticker: 'AAPL', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/23/2021', ticker: 'MSFT', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/23/2021', ticker: 'NVDA', type: 'purchase', amount: '$15,001 - $50,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/24/2021', ticker: 'JPM', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '11/24/2021', ticker: 'GS', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '12/01/2021', ticker: 'HD', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '12/01/2021', ticker: 'LOW', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '12/06/2021', ticker: 'TSLA', type: 'sale_partial', amount: '$15,001 - $50,000' },
  { name: 'Tommy Tuberville', transaction_date: '12/07/2021', ticker: 'AAPL', type: 'sale_partial', amount: '$15,001 - $50,000' },
  { name: 'Tommy Tuberville', transaction_date: '12/08/2021', ticker: 'MSFT', type: 'sale_partial', amount: '$15,001 - $50,000' },
  { name: 'Tommy Tuberville', transaction_date: '12/09/2021', ticker: 'NVDA', type: 'sale_partial', amount: '$15,001 - $50,000' },
  { name: 'Tommy Tuberville', transaction_date: '12/13/2021', ticker: 'AMD', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '12/13/2021', ticker: 'QCOM', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '12/14/2021', ticker: 'NET', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '12/14/2021', ticker: 'DDOG', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '12/15/2021', ticker: 'RIVN', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '12/15/2021', ticker: 'LCID', type: 'purchase', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '12/20/2021', ticker: 'AMD', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '12/20/2021', ticker: 'QCOM', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '12/21/2021', ticker: 'NET', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '12/21/2021', ticker: 'DDOG', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '12/22/2021', ticker: 'RIVN', type: 'sale_full', amount: '$1,001 - $15,000' },
  { name: 'Tommy Tuberville', transaction_date: '12/22/2021', ticker: 'LCID', type: 'sale_full', amount: '$1,001 - $15,000' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deterministicUuid(name: string): string {
  const hash = createHash('sha256')
    .update(`congressional-portfolio-${name}`)
    .digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    'a' + hash.slice(17, 20),
    hash.slice(20, 32)
  ].join('-');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseAmountMidpoint(amount: string): number | null {
  const trimmed = amount.trim();

  const midpoint = AMOUNT_RANGE_MIDPOINTS[trimmed];
  if (midpoint !== undefined) return midpoint;

  const exactMatch = trimmed.match(/^\$?([\d,]+(?:\.\d+)?)$/);
  if (exactMatch) return parseFloat(exactMatch[1].replace(/,/g, ''));

  const rangeMatch = trimmed.match(
    /^\$?([\d,]+(?:\.\d+)?)\s*-\s*\$?([\d,]+(?:\.\d+)?)$/
  );
  if (rangeMatch) {
    const low = parseFloat(rangeMatch[1].replace(/,/g, ''));
    const high = parseFloat(rangeMatch[2].replace(/,/g, ''));
    return (low + high) / 2;
  }

  return null;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);
    if (!isNaN(month) && !isNaN(day) && !isNaN(year)) {
      return new Date(year, month - 1, day);
    }
  }

  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate.getTime())) return isoDate;

  return null;
}

function isValidTicker(ticker: string | undefined): boolean {
  if (!ticker || ticker === '--' || ticker === 'N/A' || ticker === '') {
    return false;
  }
  return /^[A-Z]{1,5}(\.[A-Z])?$/.test(ticker.trim());
}

function normalizeTxType(rawType: string): 'BUY' | 'SELL' | null {
  const lower = rawType.toLowerCase().trim();
  if (lower.startsWith('purchase') || lower === 'buy') return 'BUY';
  if (lower.startsWith('sale') || lower === 'sell') return 'SELL';
  return null;
}

function matchPolitician(name: string): string | null {
  const normalized = name.trim().toLowerCase();
  for (const [politicianName, config] of Object.entries(POLITICIANS)) {
    for (const variant of config.nameVariants) {
      if (normalized === variant.toLowerCase()) return politicianName;
    }
    const lastName = politicianName.split(' ').pop()!.toLowerCase();
    if (normalized.includes(lastName) && lastName.length > 4) {
      return politicianName;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Data Fetching
// ---------------------------------------------------------------------------

async function fetchWithFallback(urls: string[], label: string): Promise<unknown[]> {
  for (const url of urls) {
    try {
      console.log(`  Trying ${url}...`);
      const response = await fetch(url);
      if (response.ok) {
        const data = (await response.json()) as unknown[];
        console.log(`  Fetched ${data.length} ${label} trades`);
        return data;
      }
      console.log(`  Got ${response.status}, trying next source...`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  Failed (${msg}), trying next source...`);
    }
  }
  return [];
}

interface SenateTradeRaw {
  senator: string;
  transaction_date: string;
  ticker: string;
  type: string;
  amount: string;
}

interface HouseTradeRaw {
  representative: string;
  transaction_date: string;
  ticker: string;
  type: string;
  amount: string;
}

function normalizeTrades(): Map<string, NormalizedTrade[]> {
  const result = new Map<string, NormalizedTrade[]>();
  for (const name of Object.keys(POLITICIANS)) {
    result.set(name, []);
  }
  return result;
}

function addSenateTradesFromApi(
  result: Map<string, NormalizedTrade[]>,
  senateTrades: SenateTradeRaw[]
): number {
  let matched = 0;
  for (const trade of senateTrades) {
    const politician = matchPolitician(trade.senator ?? '');
    if (!politician) continue;

    const ticker = trade.ticker?.trim().toUpperCase();
    if (!isValidTicker(ticker)) continue;

    const txType = normalizeTxType(trade.type ?? '');
    if (!txType) continue;

    const date = parseDate(trade.transaction_date ?? '');
    if (!date) continue;

    const midpoint = parseAmountMidpoint(trade.amount ?? '');
    if (!midpoint || midpoint <= 0) continue;

    result.get(politician)!.push({ politician, ticker, date, type: txType, midpoint });
    matched++;
  }
  return matched;
}

function addHouseTradesFromApi(
  result: Map<string, NormalizedTrade[]>,
  houseTrades: HouseTradeRaw[]
): number {
  let matched = 0;
  for (const trade of houseTrades) {
    const politician = matchPolitician(trade.representative ?? '');
    if (!politician) continue;

    const ticker = trade.ticker?.trim().toUpperCase();
    if (!isValidTicker(ticker)) continue;

    const txType = normalizeTxType(trade.type ?? '');
    if (!txType) continue;

    const date = parseDate(trade.transaction_date ?? '');
    if (!date) continue;

    const midpoint = parseAmountMidpoint(trade.amount ?? '');
    if (!midpoint || midpoint <= 0) continue;

    result.get(politician)!.push({ politician, ticker, date, type: txType, midpoint });
    matched++;
  }
  return matched;
}

function addStaticHouseTrades(result: Map<string, NormalizedTrade[]>): number {
  let added = 0;
  for (const trade of STATIC_HOUSE_TRADES) {
    const politician = trade.name;
    if (!result.has(politician)) continue;

    const ticker = trade.ticker.trim().toUpperCase();
    if (!isValidTicker(ticker)) continue;

    const txType = normalizeTxType(trade.type);
    if (!txType) continue;

    const date = parseDate(trade.transaction_date);
    if (!date) continue;

    const midpoint = parseAmountMidpoint(trade.amount);
    if (!midpoint || midpoint <= 0) continue;

    result.get(politician)!.push({ politician, ticker, date, type: txType, midpoint });
    added++;
  }
  return added;
}

// ---------------------------------------------------------------------------
// Yahoo Finance Price Lookup
// ---------------------------------------------------------------------------

const priceCache = new Map<string, number>();
let yahooFinance: InstanceType<typeof import('yahoo-finance2').default>;

async function initYahooFinance() {
  const { default: YahooFinance } = await import('yahoo-finance2');
  yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
}

function formatYahooDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function lookupPrice(symbol: string, date: Date): Promise<number | null> {
  const dateKey = formatYahooDate(date);
  const cacheKey = `${symbol}-${dateKey}`;

  if (priceCache.has(cacheKey)) return priceCache.get(cacheKey)!;

  for (let offset = 0; offset <= 5; offset++) {
    const lookupDate = new Date(date);
    lookupDate.setDate(lookupDate.getDate() + offset);

    const period2 = new Date(lookupDate);
    period2.setDate(period2.getDate() + 1);

    try {
      const result = await yahooFinance.chart(symbol, {
        interval: '1d',
        period1: formatYahooDate(lookupDate),
        period2: formatYahooDate(period2)
      });

      const quotes = result?.quotes ?? [];
      if (quotes.length > 0 && quotes[0].close != null) {
        const price = quotes[0].close;
        priceCache.set(cacheKey, price);
        return price;
      }
    } catch {
      // Try next day offset
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Database Seeding
// ---------------------------------------------------------------------------

async function seedPolitician(
  name: string,
  trades: NormalizedTrade[]
): Promise<{ tradeCount: number; skipped: number }> {
  if (trades.length === 0) {
    console.log(`  ${name}: No trades found, skipping`);
    return { tradeCount: 0, skipped: 0 };
  }

  const userId = deterministicUuid(name);
  const accountId = deterministicUuid(`${name}-account`);

  // Delete existing orders for idempotency on re-run
  await prisma.order.deleteMany({ where: { userId } });

  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      provider: 'ANONYMOUS',
      role: 'USER',
      accounts: {
        create: {
          id: accountId,
          currency: 'USD',
          name: `${name} Congressional Portfolio`
        }
      },
      settings: {
        create: {
          settings: { currency: 'USD' }
        }
      }
    }
  });

  trades.sort((a, b) => a.date.getTime() - b.date.getTime());

  const uniqueTickers = [...new Set(trades.map((t) => t.ticker))];
  const symbolProfileIds = new Map<string, string>();

  for (const ticker of uniqueTickers) {
    const profile = await prisma.symbolProfile.upsert({
      where: {
        dataSource_symbol: { dataSource: 'YAHOO', symbol: ticker }
      },
      update: {},
      create: {
        currency: 'USD',
        dataSource: 'YAHOO',
        symbol: ticker
      }
    });
    symbolProfileIds.set(ticker, profile.id);
  }

  let seeded = 0;
  let skipped = 0;

  const seen = new Set<string>();

  for (const trade of trades) {
    const dedupeKey = `${trade.ticker}-${trade.date.toISOString()}-${trade.type}`;
    if (seen.has(dedupeKey)) {
      skipped++;
      continue;
    }
    seen.add(dedupeKey);

    await sleep(RATE_LIMIT_MS);

    const price = await lookupPrice(trade.ticker, trade.date);
    if (!price || price <= 0) {
      console.log(`    SKIP: No price for ${trade.ticker} on ${formatYahooDate(trade.date)}`);
      skipped++;
      continue;
    }

    const quantity = Math.max(1, Math.round(trade.midpoint / price));

    try {
      await prisma.order.create({
        data: {
          account: {
            connect: { id_userId: { id: accountId, userId } }
          },
          SymbolProfile: {
            connect: { id: symbolProfileIds.get(trade.ticker)! }
          },
          user: { connect: { id: userId } },
          currency: 'USD',
          date: trade.date,
          fee: 0,
          quantity,
          type: trade.type,
          unitPrice: price
        }
      });
      seeded++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('Unique constraint')) {
        console.log(`    ERROR creating order for ${trade.ticker}: ${message}`);
      }
      skipped++;
    }

    if (seeded % 25 === 0 && seeded > 0) {
      console.log(`    ${name}: ${seeded} trades seeded so far...`);
    }
  }

  return { tradeCount: seeded, skipped };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Congressional Portfolio Seeding ===\n');

  await initYahooFinance();

  const tradesByPolitician = normalizeTrades();

  // Senate: fetch from API
  console.log('Fetching Senate trades...');
  const senateData = (await fetchWithFallback(SENATE_URLS, 'Senate')) as SenateTradeRaw[];
  const senateMatched = addSenateTradesFromApi(tradesByPolitician, senateData);
  console.log(`  Matched ${senateMatched} Senate trades for target politicians`);

  // House: try API first, fall back to static data
  console.log('\nFetching House trades...');
  const houseData = (await fetchWithFallback(HOUSE_URLS, 'House')) as HouseTradeRaw[];
  let houseMatched = 0;
  if (houseData.length > 0) {
    houseMatched = addHouseTradesFromApi(tradesByPolitician, houseData);
    console.log(`  Matched ${houseMatched} House trades from API`);
  }

  // Fill in any politicians with 0 trades from static data
  const politiciansWithNoTrades = [...tradesByPolitician.entries()]
    .filter(([, trades]) => trades.length === 0)
    .map(([name]) => name);

  if (houseData.length === 0 || politiciansWithNoTrades.length > 0) {
    const reason = houseData.length === 0
      ? 'House API unavailable'
      : `Missing data for: ${politiciansWithNoTrades.join(', ')}`;
    console.log(`  ${reason}, using static disclosure data...`);
    const staticAdded = addStaticHouseTrades(tradesByPolitician);
    console.log(`  Added ${staticAdded} static trades`);
  }

  // Seed each politician
  const summary: Array<{ name: string; trades: number; skipped: number }> = [];

  for (const [name, trades] of tradesByPolitician) {
    console.log(`\nSeeding ${name} (${trades.length} raw trades)...`);
    const result = await seedPolitician(name, trades);
    summary.push({ name, trades: result.tradeCount, skipped: result.skipped });
  }

  console.log('\n=== Seeding Summary ===');
  for (const { name, trades, skipped } of summary) {
    console.log(`  ${name}: ${trades} trades seeded, ${skipped} skipped`);
  }
  console.log(`\nTotal: ${summary.reduce((s, r) => s + r.trades, 0)} trades seeded`);
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
