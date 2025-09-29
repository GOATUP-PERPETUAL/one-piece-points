import Decimal from 'decimal.js';

// GraphQL Query Types (Raw response from subgraph)
export interface SubgraphSnapResponse {
  margin?: string;
  tradedReferralsCount?: string;
  tradingVolume: string;
  conditionTradeVolume: string;
  timestamp: string;
  swap: string;
  referral?: string;
  netProfit: string;
  collateralUsd?: string;
  id: string;
}

export interface SubgraphLiquiditySnapResponse {
  lp: string;
  basePoints: string;
  timestamp: string;
  id: string;
}

export interface SubgraphLiquidityResponse {
  account: string;
  lp: string;
  start: SubgraphLiquiditySnapResponse[];
  ended: SubgraphLiquiditySnapResponse[];
}

export interface SubgraphLeaderboardResponse {
  account: string;
  swap: string;
  tradingVolume: string;
  conditionTradeVolume: string;
  netProfit: string;
  latestUpdateTimestamp: string;
  start: SubgraphSnapResponse[];
  ended: SubgraphSnapResponse[];
  liquidity: SubgraphLiquidityResponse | null;
}

export interface SubgraphQueryResponse {
  data: SubgraphLeaderboardResponse[];
}

// Query Variables
export interface SubgraphQueryVariables {
  skip: number;
  epochBegin: number;
  epochEnded: number;
}

// GraphQL Query String
export const LEADERBOARD_QUERY = `
  query MyQuery($skip: Int!, $epochBegin: Int!, $epochEnded: Int!) {
    data: leaderboards(first: 1000, skip: $skip) {
      account: id
      swap
      tradingVolume
      conditionTradeVolume
      netProfit
      latestUpdateTimestamp
      start: snap(first: 1, orderBy: timestamp, orderDirection: desc, where: { timestamp_lte: $epochBegin }) {
        margin
        tradedReferralsCount
        tradingVolume
        conditionTradeVolume
        timestamp
        swap
        referral
        netProfit
        collateralUsd
        id
      }
      ended: snap(first: 1, orderBy: timestamp, orderDirection: desc, where: { timestamp_lte: $epochEnded }) {
        margin
        tradedReferralsCount
        tradingVolume
        conditionTradeVolume
        timestamp
        swap
        referral
        netProfit
        collateralUsd
        id
      }
      liquidity {
        account: id
        lp
        start: snap(first: 1, orderBy: timestamp, orderDirection: desc, where: { timestamp_lte: $epochBegin }) {
          lp
          basePoints
          timestamp
          id
        }
        ended: snap(first: 1, orderBy: timestamp, orderDirection: desc, where: { timestamp_lte: $epochEnded }) {
          lp
          basePoints
          timestamp
          id
        }
      }
    }
  }
`;

// Configuration for subgraph client
export interface SubgraphConfig {
  endpoint: string;
  requestsPerSecond?: number;
  maxRetries?: number;
  retryDelay?: number;
}

// Default configuration
export const DEFAULT_SUBGRAPH_CONFIG: SubgraphConfig = {
  endpoint: 'https://api.goat.0xgraph.xyz/api/public/484b3c49-8f28-4a57-b4ae-dc6be91dd78f/subgraphs/goat-perp/v1.0.0/gn',
  requestsPerSecond: 5,
  maxRetries: 3,
  retryDelay: 1000
};

// Pagination info
export interface PaginationInfo {
  skip: number;
  hasMore: boolean;
  totalFetched: number;
}

// Fetch result with pagination info
export interface FetchResult {
  data: SubgraphLeaderboardResponse[];
  pagination: PaginationInfo;
}

// Error types
export class SubgraphError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'SubgraphError';
  }
}

export class RateLimitError extends SubgraphError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT', 429);
  }
}

export class NetworkError extends SubgraphError {
  constructor(message: string, statusCode?: number) {
    super(message, 'NETWORK_ERROR', statusCode);
  }
}