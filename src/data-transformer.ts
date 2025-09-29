import Decimal from 'decimal.js';
import {
  SubgraphLeaderboardResponse,
  SubgraphSnapResponse,
  SubgraphLiquidityResponse,
  SubgraphLiquiditySnapResponse
} from './subgraph-types';
import {
  PerpLeaderboard,
  PerpLeaderboardSnap,
  PerpLiquidity,
  PerpLiquiditySnap
} from './index';

/**
 * Data transformation utilities to convert raw subgraph responses
 * into the types used by the calculation engine
 */

/**
 * Convert a raw subgraph snap response to PerpLeaderboardSnap
 */
export function transformLeaderboardSnap(snap: SubgraphSnapResponse): PerpLeaderboardSnap {
  return {
    tradingVolume: new Decimal(snap.tradingVolume || '0'),
    conditionTradeVolume: new Decimal(snap.conditionTradeVolume || '0'),
    swap: new Decimal(snap.swap || '0'),
    netProfit: new Decimal(snap.netProfit || '0')
  };
}

/**
 * Convert a raw subgraph liquidity snap response to PerpLiquiditySnap
 */
export function transformLiquiditySnap(snap: SubgraphLiquiditySnapResponse): PerpLiquiditySnap {
  return {
    id: snap.id,
    lp: new Decimal(snap.lp || '0'),
    basePoints: new Decimal(snap.basePoints || '0'),
    timestamp: parseInt(snap.timestamp)
  };
}

/**
 * Convert a raw subgraph liquidity response to PerpLiquidity
 */
export function transformLiquidity(liquidity: SubgraphLiquidityResponse | null): PerpLiquidity {
  if (!liquidity) {
    return {
      account: '',
      lp: new Decimal(0),
      start: [],
      ended: []
    };
  }

  return {
    account: liquidity.account,
    lp: new Decimal(liquidity.lp || '0'),
    start: liquidity.start.map(transformLiquiditySnap),
    ended: liquidity.ended.map(transformLiquiditySnap)
  };
}

/**
 * Convert a raw subgraph leaderboard response to PerpLeaderboard
 */
export function transformLeaderboard(leaderboard: SubgraphLeaderboardResponse): PerpLeaderboard {
  return {
    account: leaderboard.account,
    tradingVolume: new Decimal(leaderboard.tradingVolume || '0'),
    conditionTradeVolume: new Decimal(leaderboard.conditionTradeVolume || '0'),
    swap: new Decimal(leaderboard.swap || '0'),
    netProfit: new Decimal(leaderboard.netProfit || '0'),
    latestUpdateTimestamp: parseInt(leaderboard.latestUpdateTimestamp),
    start: leaderboard.start.map(transformLeaderboardSnap),
    ended: leaderboard.ended.map(transformLeaderboardSnap),
    liquidity: transformLiquidity(leaderboard.liquidity)
  };
}

/**
 * Convert an array of raw subgraph responses to PerpLeaderboard array
 */
export function transformLeaderboards(leaderboards: SubgraphLeaderboardResponse[]): PerpLeaderboard[] {
  return leaderboards.map(transformLeaderboard);
}

/**
 * Data validation utilities
 */
export class DataValidator {
  /**
   * Validate that a leaderboard entry has required fields
   */
  static validateLeaderboard(leaderboard: SubgraphLeaderboardResponse): string[] {
    const errors: string[] = [];

    if (!leaderboard.account) {
      errors.push('Missing account address');
    }

    if (!leaderboard.tradingVolume) {
      errors.push('Missing trading volume');
    }

    if (!leaderboard.latestUpdateTimestamp) {
      errors.push('Missing latest update timestamp');
    }

    // Validate numeric fields
    const numericFields = [
      'tradingVolume',
      'conditionTradeVolume',
      'swap',
      'netProfit'
    ] as const;

    for (const field of numericFields) {
      const value = leaderboard[field];
      if (value && !this.isValidNumericString(value)) {
        errors.push(`Invalid numeric value for ${field}: ${value}`);
      }
    }

    return errors;
  }

  /**
   * Validate that a liquidity entry has required fields
   */
  static validateLiquidity(liquidity: SubgraphLiquidityResponse): string[] {
    const errors: string[] = [];

    if (!liquidity.account) {
      errors.push('Missing liquidity account address');
    }

    if (!liquidity.lp) {
      errors.push('Missing LP amount');
    }

    if (!this.isValidNumericString(liquidity.lp)) {
      errors.push(`Invalid LP amount: ${liquidity.lp}`);
    }

    // Validate snapshots
    for (const snap of liquidity.start) {
      const snapErrors = this.validateLiquiditySnap(snap);
      errors.push(...snapErrors.map(err => `Start snap: ${err}`));
    }

    for (const snap of liquidity.ended) {
      const snapErrors = this.validateLiquiditySnap(snap);
      errors.push(...snapErrors.map(err => `End snap: ${err}`));
    }

    return errors;
  }

  /**
   * Validate a liquidity snapshot
   */
  static validateLiquiditySnap(snap: SubgraphLiquiditySnapResponse): string[] {
    const errors: string[] = [];

    if (!snap.id) {
      errors.push('Missing snapshot ID');
    }

    if (!snap.timestamp) {
      errors.push('Missing timestamp');
    }

    if (!this.isValidNumericString(snap.lp)) {
      errors.push(`Invalid LP value: ${snap.lp}`);
    }

    if (!this.isValidNumericString(snap.basePoints)) {
      errors.push(`Invalid basePoints value: ${snap.basePoints}`);
    }

    return errors;
  }

  /**
   * Check if a string represents a valid number
   */
  static isValidNumericString(value: string): boolean {
    if (!value) return false;
    try {
      new Decimal(value);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate an array of leaderboards and return summary
   */
  static validateLeaderboards(leaderboards: SubgraphLeaderboardResponse[]): {
    validCount: number;
    invalidCount: number;
    errors: Array<{ index: number; account: string; errors: string[] }>;
  } {
    const errors: Array<{ index: number; account: string; errors: string[] }> = [];
    let validCount = 0;

    leaderboards.forEach((leaderboard, index) => {
      const leaderboardErrors = this.validateLeaderboard(leaderboard);
      
      if (leaderboard.liquidity) {
        const liquidityErrors = this.validateLiquidity(leaderboard.liquidity);
        leaderboardErrors.push(...liquidityErrors);
      }

      if (leaderboardErrors.length > 0) {
        errors.push({
          index,
          account: leaderboard.account || 'unknown',
          errors: leaderboardErrors
        });
      } else {
        validCount++;
      }
    });

    return {
      validCount,
      invalidCount: errors.length,
      errors
    };
  }
}

/**
 * Data filtering utilities
 */
export class DataFilter {
  /**
   * Filter leaderboards by minimum trading volume
   */
  static filterByMinTradingVolume(
    leaderboards: SubgraphLeaderboardResponse[],
    minVolume: Decimal
  ): SubgraphLeaderboardResponse[] {
    return leaderboards.filter(lb => {
      const volume = new Decimal(lb.tradingVolume || '0');
      return volume.gte(minVolume);
    });
  }

  /**
   * Filter leaderboards by accounts with liquidity
   */
  static filterWithLiquidity(
    leaderboards: SubgraphLeaderboardResponse[]
  ): SubgraphLeaderboardResponse[] {
    return leaderboards.filter(lb => {
      return lb.liquidity && 
             lb.liquidity.lp && 
             new Decimal(lb.liquidity.lp).gt(0);
    });
  }

  /**
   * Filter leaderboards by profitable traders
   */
  static filterProfitable(
    leaderboards: SubgraphLeaderboardResponse[]
  ): SubgraphLeaderboardResponse[] {
    return leaderboards.filter(lb => {
      const netProfit = new Decimal(lb.netProfit || '0');
      return netProfit.gt(0);
    });
  }

  /**
   * Filter leaderboards by time range based on latest update
   */
  static filterByTimeRange(
    leaderboards: SubgraphLeaderboardResponse[],
    startTime: number,
    endTime: number
  ): SubgraphLeaderboardResponse[] {
    return leaderboards.filter(lb => {
      const timestamp = parseInt(lb.latestUpdateTimestamp);
      return timestamp >= startTime && timestamp <= endTime;
    });
  }

  /**
   * Get top N traders by trading volume
   */
  static getTopTraders(
    leaderboards: SubgraphLeaderboardResponse[],
    count: number = 10
  ): SubgraphLeaderboardResponse[] {
    return leaderboards
      .sort((a, b) => {
        const volumeA = new Decimal(a.tradingVolume || '0');
        const volumeB = new Decimal(b.tradingVolume || '0');
        return volumeB.minus(volumeA).toNumber();
      })
      .slice(0, count);
  }

  /**
   * Get top N traders by net profit
   */
  static getTopProfitable(
    leaderboards: SubgraphLeaderboardResponse[],
    count: number = 10
  ): SubgraphLeaderboardResponse[] {
    return leaderboards
      .sort((a, b) => {
        const profitA = new Decimal(a.netProfit || '0');
        const profitB = new Decimal(b.netProfit || '0');
        return profitB.minus(profitA).toNumber();
      })
      .slice(0, count);
  }
}

/**
 * Data statistics utilities
 */
export class DataStats {
  /**
   * Calculate basic statistics for a dataset
   */
  static calculateStats(leaderboards: SubgraphLeaderboardResponse[]): {
    totalUsers: number;
    totalTradingVolume: Decimal;
    totalNetProfit: Decimal;
    averageTradingVolume: Decimal;
    averageNetProfit: Decimal;
    usersWithLiquidity: number;
    profitableUsers: number;
  } {
    const totalUsers = leaderboards.length;
    let totalTradingVolume = new Decimal(0);
    let totalNetProfit = new Decimal(0);
    let usersWithLiquidity = 0;
    let profitableUsers = 0;

    for (const lb of leaderboards) {
      const volume = new Decimal(lb.tradingVolume || '0');
      const profit = new Decimal(lb.netProfit || '0');

      totalTradingVolume = totalTradingVolume.add(volume);
      totalNetProfit = totalNetProfit.add(profit);

      if (lb.liquidity && new Decimal(lb.liquidity.lp || '0').gt(0)) {
        usersWithLiquidity++;
      }

      if (profit.gt(0)) {
        profitableUsers++;
      }
    }

    return {
      totalUsers,
      totalTradingVolume,
      totalNetProfit,
      averageTradingVolume: totalUsers > 0 ? totalTradingVolume.div(totalUsers) : new Decimal(0),
      averageNetProfit: totalUsers > 0 ? totalNetProfit.div(totalUsers) : new Decimal(0),
      usersWithLiquidity,
      profitableUsers
    };
  }
}