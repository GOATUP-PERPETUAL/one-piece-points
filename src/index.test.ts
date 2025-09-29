import Decimal from 'decimal.js';
import {
  calculateLiquidityPointBase,
  calculateUserPoints,
  PerpLiquidity,
  PerpLeaderboard,
  CalculationConfig,
  PerpLiquiditySnap,
  PerpLeaderboardSnap,
} from './index';

describe('Perpetual Points Calculator', () => {
  // Test data helpers
  const createLiquiditySnap = (
    id: string,
    lp: number,
    basePoints: number,
    timestamp: number
  ): PerpLiquiditySnap => ({
    id,
    lp: new Decimal(lp),
    basePoints: new Decimal(basePoints),
    timestamp
  });

  const createLeaderboardSnap = (
    tradingVolume: number,
    conditionTradeVolume: number,
    swap: number,
    netProfit: number
  ): PerpLeaderboardSnap => ({
    tradingVolume: new Decimal(tradingVolume),
    conditionTradeVolume: new Decimal(conditionTradeVolume),
    swap: new Decimal(swap),
    netProfit: new Decimal(netProfit)
  });


  const createConfig = (
    liquidityRate: number = 1,
    tradeProfitRate: number = 1,
    tradeRate: number = 1,
  ): CalculationConfig => ({
    liquidityRate: new Decimal(liquidityRate),
    tradeProfitRate: new Decimal(tradeProfitRate),
    tradeRate: new Decimal(tradeRate),
  });

  describe('calculateLiquidityPointBase', () => {
    it('should return 0 when no snapshots exist', () => {
      const liquidity: PerpLiquidity = {
        account: 'test',
        lp: new Decimal(100),
        start: [],
        ended: []
      };

      const result = calculateLiquidityPointBase(liquidity, 1000, 2000);
      expect(result.toNumber()).toBe(0);
    });

    it('should return 0 when end snapshot is before start time', () => {
      const liquidity: PerpLiquidity = {
        account: 'test',
        lp: new Decimal(100),
        start: [createLiquiditySnap('1', 100, 50, 500)],
        ended: [createLiquiditySnap('2', 200, 100, 800)]
      };

      const result = calculateLiquidityPointBase(liquidity, 1000, 2000);
      expect(result.toNumber()).toBe(0);
    });

    it('should calculate integral correctly within time segment', () => {
      const liquidity: PerpLiquidity = {
        account: 'test',
        lp: new Decimal(100),
        start: [createLiquiditySnap('1', 100, 50, 1000)],
        ended: [createLiquiditySnap('2', 200, 100, 1500)]
      };

      const result = calculateLiquidityPointBase(liquidity, 1200, 1400);
      // Time weight: 1400 - 1200 = 200
      // Average LP: (100 + 200) / 2 = 150
      // Expected: 150 * 200 = 30000
      expect(result.toNumber()).toBe(30000);
    });

    it('should handle time after end snapshot', () => {
      const liquidity: PerpLiquidity = {
        account: 'test',
        lp: new Decimal(100),
        start: [createLiquiditySnap('1', 100, 50, 1000)],
        ended: [createLiquiditySnap('2', 200, 100, 1500)]
      };

      const result = calculateLiquidityPointBase(liquidity, 1200, 1800);
      // Integral within segment: 150 * (1500 - 1200) = 45000
      // Time after end: 200 * (1800 - 1500) = 60000
      // Total: 45000 + 60000 = 105000
      expect(result.toNumber()).toBe(105000);
    });

    it('should handle start time before start snapshot', () => {
      const liquidity: PerpLiquidity = {
        account: 'test',
        lp: new Decimal(100),
        start: [createLiquiditySnap('1', 100, 50, 1200)],
        ended: [createLiquiditySnap('2', 200, 100, 1500)]
      };

      const result = calculateLiquidityPointBase(liquidity, 1000, 1400);
      // Effective start: max(1000, 1200) = 1200
      // Effective end: min(1400, 1500) = 1400
      // Time weight: 1400 - 1200 = 200
      // Average LP: (100 + 200) / 2 = 150
      // Expected: 150 * 200 = 30000
      expect(result.toNumber()).toBe(30000);
    });
  });

  describe('calculateUserPoints', () => {
    let defaultConfig: CalculationConfig;

    beforeEach(() => {
      defaultConfig = createConfig();
    });

    it('should calculate points for user without liquidity', () => {
      const leaderboard: PerpLeaderboard = {
        account: 'user1',
        tradingVolume: new Decimal(1000),
        conditionTradeVolume: new Decimal(500),
        swap: new Decimal(100),
        netProfit: new Decimal(50),
        latestUpdateTimestamp: 1500,
        start: [],
        ended: [],
        liquidity: {
          account: 'user1',
          lp: new Decimal(0),
          start: [],
          ended: []
        }
      };

      const results = calculateUserPoints(
        [leaderboard],
        defaultConfig,
        1000,
        1500,
        false
      );

      expect(results).toHaveLength(1);
      expect(results[0].account).toBe('user1');
      expect(results[0].lp_usd_hours.toNumber()).toBe(0);
      expect(results[0].volume_usd.toNumber()).toBe(1000);
      expect(results[0].realized_pnl_net_usd.toNumber()).toBe(50);
    });

    it('should calculate liquidity points correctly', () => {
      const leaderboard: PerpLeaderboard = {
        account: 'user1',
        tradingVolume: new Decimal(0),
        conditionTradeVolume: new Decimal(0),
        swap: new Decimal(0),
        netProfit: new Decimal(0),
        latestUpdateTimestamp: 1500,
        start: [],
        ended: [],
        liquidity: {
          account: 'user1',
          lp: new Decimal(100),
          start: [createLiquiditySnap('1', 100, 50, 1000)],
          ended: [createLiquiditySnap('2', 200, 100, 1400)]
        }
      };

      const config = createConfig(2, 0); // liquidityRate = 2
      const results = calculateUserPoints(
        [leaderboard],
        config,
        1000,
        1500,
        false
      );

      expect(results[0].lp_usd_hours.gt(0)).toBe(true);
    });

    it('should apply liquidity limit correctly', () => {
      const leaderboard: PerpLeaderboard = {
        account: 'user1',
        tradingVolume: new Decimal(0),
        conditionTradeVolume: new Decimal(0),
        swap: new Decimal(0),
        netProfit: new Decimal(0),
        latestUpdateTimestamp: 1500,
        start: [],
        ended: [],
        liquidity: {
          account: 'user1',
          lp: new Decimal(100),
          start: [createLiquiditySnap('1', 1000, 500, 1000)],
          ended: [createLiquiditySnap('2', 2000, 1000, 1400)]
        }
      };

      const config = createConfig(2, 1000); // liquidityLimit = 1000
      const results = calculateUserPoints(
        [leaderboard],
        config,
        1000,
        1500,
        false
      );

      expect(results[0].lp_usd_hours.toNumber()).toBe(1000);
    });

    it('should handle trade volume with start snapshot', () => {
      const startSnap = createLeaderboardSnap(200, 100, 50, 10);
      const leaderboard: PerpLeaderboard = {
        account: 'user1',
        tradingVolume: new Decimal(1000),
        conditionTradeVolume: new Decimal(500),
        swap: new Decimal(100),
        netProfit: new Decimal(50),
        latestUpdateTimestamp: 1500,
        start: [startSnap],
        ended: [],
        liquidity: {
          account: 'user1',
          lp: new Decimal(0),
          start: [],
          ended: []
        }
      };

      const results = calculateUserPoints(
        [leaderboard],
        defaultConfig,
        1000,
        1500,
        false
      );

      // Trade volume should be 1000 - 200 = 800
      expect(results[0].volume_usd.toNumber()).toBe(800);
      // Net profit should be 50 - 10 = 40
      expect(results[0].realized_pnl_net_usd.toNumber()).toBe(40);
    });

    it('should handle overtime scenario correctly', () => {
      const startSnap = createLeaderboardSnap(200, 100, 50, 10);
      const endSnap = createLeaderboardSnap(1200, 600, 150, 60);
      const leaderboard: PerpLeaderboard = {
        account: 'user1',
        tradingVolume: new Decimal(1500),
        conditionTradeVolume: new Decimal(750),
        swap: new Decimal(200),
        netProfit: new Decimal(80),
        latestUpdateTimestamp: 2500, // After reachAt (2000)
        start: [startSnap],
        ended: [endSnap],
        liquidity: {
          account: 'user1',
          lp: new Decimal(0),
          start: [],
          ended: []
        }
      };

      const results = calculateUserPoints(
        [leaderboard],
        defaultConfig,
        1000,
        1500,
        true // overtime = true
      );

      // Should use ended snapshot: 1200 - 200 = 1000
      expect(results[0].volume_usd.toNumber()).toBe(1000);
      // Net profit: 60 - 10 = 50
      expect(results[0].realized_pnl_net_usd.toNumber()).toBe(50);
    });

    it('should apply trade limits correctly', () => {
      const leaderboard: PerpLeaderboard = {
        account: 'user1',
        tradingVolume: new Decimal(2000),
        conditionTradeVolume: new Decimal(1000),
        swap: new Decimal(200),
        netProfit: new Decimal(1000),
        latestUpdateTimestamp: 1500,
        start: [],
        ended: [],
        liquidity: {
          account: 'user1',
          lp: new Decimal(0),
          start: [],
          ended: []
        }
      };

      const config = createConfig(1, 1,  1); // tradeLimit = 1500, tradeProfitLimit = 500
      const results = calculateUserPoints(
        [leaderboard],
        config,
        1000,
        1500,
        false
      );

      expect(results[0].volume_usd.toNumber()).toBe(1500);
      expect(results[0].realized_pnl_net_usd.toNumber()).toBe(500);
    });

    it('should not calculate profit points for negative profit', () => {
      const leaderboard: PerpLeaderboard = {
        account: 'user1',
        tradingVolume: new Decimal(1000),
        conditionTradeVolume: new Decimal(500),
        swap: new Decimal(100),
        netProfit: new Decimal(-50), // Negative profit
        latestUpdateTimestamp: 1500,
        start: [],
        ended: [],
        liquidity: {
          account: 'user1',
          lp: new Decimal(0),
          start: [],
          ended: []
        }
      };

      const results = calculateUserPoints(
        [leaderboard],
        defaultConfig,
        1000,
        1500,
        false
      );

      expect(results[0].realized_pnl_net_usd.toNumber()).toBe(0);
    });

    it('should ensure all points are non-negative', () => {
      const leaderboard: PerpLeaderboard = {
        account: 'user1',
        tradingVolume: new Decimal(-100), // This could lead to negative after calculation
        conditionTradeVolume: new Decimal(0),
        swap: new Decimal(0),
        netProfit: new Decimal(-100),
        latestUpdateTimestamp: 1500,
        start: [],
        ended: [],
        liquidity: {
          account: 'user1',
          lp: new Decimal(0),
          start: [],
          ended: []
        }
      };

      const results = calculateUserPoints(
        [leaderboard],
        defaultConfig,
        1000,
        1500,
        false
      );

      expect(results[0].volume_usd.gte(0)).toBe(true);
      expect(results[0].realized_pnl_net_usd.gte(0)).toBe(true);
      expect(results[0].lp_usd_hours.gte(0)).toBe(true);
    });

    it('should handle multiple users correctly', () => {
      const leaderboards: PerpLeaderboard[] = [
        {
          account: 'user1',
          tradingVolume: new Decimal(1000),
          conditionTradeVolume: new Decimal(500),
          swap: new Decimal(100),
          netProfit: new Decimal(50),
          latestUpdateTimestamp: 1500,
          start: [],
          ended: [],
          liquidity: {
            account: 'user1',
            lp: new Decimal(0),
            start: [],
            ended: []
          }
        },
        {
          account: 'user2',
          tradingVolume: new Decimal(2000),
          conditionTradeVolume: new Decimal(1000),
          swap: new Decimal(200),
          netProfit: new Decimal(100),
          latestUpdateTimestamp: 1500,
          start: [],
          ended: [],
          liquidity: {
            account: 'user2',
            lp: new Decimal(0),
            start: [],
            ended: []
          }
        }
      ];

      const results = calculateUserPoints(
        leaderboards,
        defaultConfig,
        1000,
        1500,
        false
      );

      expect(results).toHaveLength(2);
      expect(results[0].account).toBe('user1');
      expect(results[1].account).toBe('user2');
      expect(results[0].volume_usd.toNumber()).toBe(1000);
      expect(results[1].volume_usd.toNumber()).toBe(2000);
    });
  });
});