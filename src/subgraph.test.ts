import Decimal from 'decimal.js';
import { SubgraphClient } from './subgraph-client';
import { 
  transformLeaderboards,
  DataValidator,
  DataFilter,
  DataStats
} from './data-transformer';
import { DEFAULT_SUBGRAPH_CONFIG } from './subgraph-types';

describe('Subgraph Integration', () => {
  let client: SubgraphClient;

  beforeEach(() => {
    // Use a longer timeout for integration tests
    jest.setTimeout(30000);
    
    client = new SubgraphClient({
      ...DEFAULT_SUBGRAPH_CONFIG,
      requestsPerSecond: 2, // Be conservative in tests
      maxRetries: 2
    });
  });

  describe('SubgraphClient', () => {
    it('should create client with default config', () => {
      const config = client.getConfig();
      expect(config.endpoint).toBe(DEFAULT_SUBGRAPH_CONFIG.endpoint);
      expect(config.requestsPerSecond).toBe(2);
    });

    it('should update client config', () => {
      client.updateConfig({ requestsPerSecond: 10 });
      const config = client.getConfig();
      expect(config.requestsPerSecond).toBe(10);
    });

    // Note: These tests will make real network requests
    // In a real project, you might want to mock these or use test data
    describe('Real Network Tests', () => {
      // Skip these tests by default to avoid hitting the real API during CI
      const runNetworkTests = process.env.RUN_NETWORK_TESTS === 'true';
      
      (runNetworkTests ? it : it.skip)('should fetch first page of data', async () => {
        const epochBegin = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60); // 1 week ago
        const epochEnded = Math.floor(Date.now() / 1000);

        const result = await client.fetchPage(epochBegin, epochEnded, 0);
        
        expect(result.data).toBeInstanceOf(Array);
        expect(result.pagination.skip).toBe(0);
        expect(typeof result.pagination.hasMore).toBe('boolean');
        expect(typeof result.pagination.totalFetched).toBe('number');
      });

      (runNetworkTests ? it : it.skip)('should get data stats', async () => {
        const epochBegin = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
        const epochEnded = Math.floor(Date.now() / 1000);

        const stats = await client.getDataStats(epochBegin, epochEnded);
        
        expect(typeof stats.totalRecords).toBe('number');
        expect(stats.sampleData).toBeInstanceOf(Array);
        expect(stats.sampleData.length).toBeLessThanOrEqual(5);
      });
    });
  });

  describe('Data Transformer', () => {
    const mockSubgraphData = [
      {
        account: '0x1234567890123456789012345678901234567890',
        swap: '1000000000000000000',
        tradingVolume: '50000000000000000000000',
        conditionTradeVolume: '25000000000000000000000',
        netProfit: '2500000000000000000000',
        latestUpdateTimestamp: '1672531200',
        start: [{
          tradingVolume: '10000000000000000000000',
          conditionTradeVolume: '5000000000000000000000',
          swap: '500000000000000000',
          netProfit: '250000000000000000000',
          margin: '0',
          tradedReferralsCount: '0',
          timestamp: '1640995200',
          referral: '0x0000000000000000000000000000000000000000',
          collateralUsd: '0',
          id: 'start_snap_1'
        }],
        ended: [{
          tradingVolume: '45000000000000000000000',
          conditionTradeVolume: '22500000000000000000000',
          swap: '900000000000000000',
          netProfit: '2200000000000000000000',
          margin: '0',
          tradedReferralsCount: '0',
          timestamp: '1672444800',
          referral: '0x0000000000000000000000000000000000000000',
          collateralUsd: '0',
          id: 'end_snap_1'
        }],
        liquidity: {
          account: '0x1234567890123456789012345678901234567890',
          lp: '10000000000000000000000',
          start: [{
            lp: '8000000000000000000000',
            basePoints: '4000000000000000000000',
            timestamp: '1640995200',
            id: 'liq_start_1'
          }],
          ended: [{
            lp: '12000000000000000000000',
            basePoints: '6000000000000000000000',
            timestamp: '1672444800',
            id: 'liq_end_1'
          }]
        }
      },
      {
        account: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        swap: '500000000000000000',
        tradingVolume: '25000000000000000000000',
        conditionTradeVolume: '12500000000000000000000',
        netProfit: '-500000000000000000000',
        latestUpdateTimestamp: '1672531200',
        start: [],
        ended: [],
        liquidity: null
      }
    ];

    it('should transform subgraph data to calculation types', () => {
      const transformed = transformLeaderboards(mockSubgraphData);
      
      expect(transformed).toHaveLength(2);
      
      const first = transformed[0];
      expect(first.account).toBe('0x1234567890123456789012345678901234567890');
      expect(first.tradingVolume.toString()).toBe('50000');
      expect(first.netProfit.toString()).toBe('2500');
      expect(first.start).toHaveLength(1);
      expect(first.ended).toHaveLength(1);
      expect(first.liquidity.start).toHaveLength(1);
      expect(first.liquidity.ended).toHaveLength(1);

      const second = transformed[1];
      expect(second.account).toBe('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd');
      expect(second.netProfit.toString()).toBe('-500');
      expect(second.start).toHaveLength(0);
      expect(second.ended).toHaveLength(0);
      expect(second.liquidity.start).toHaveLength(0);
      expect(second.liquidity.ended).toHaveLength(0);
    });

    it('should validate data correctly', () => {
      const validation = DataValidator.validateLeaderboards(mockSubgraphData);
      
      expect(validation.validCount).toBe(2);
      expect(validation.invalidCount).toBe(0);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid data', () => {
      const invalidData = [{
        ...mockSubgraphData[0],
        account: '', // Invalid: missing account
        tradingVolume: 'invalid_number' // Invalid: not a number
      }];

      const validation = DataValidator.validateLeaderboards(invalidData);
      
      expect(validation.validCount).toBe(0);
      expect(validation.invalidCount).toBe(1);
      expect(validation.errors[0].errors).toContain('Missing account address');
      expect(validation.errors[0].errors).toContain('Invalid numeric value for tradingVolume: invalid_number');
    });

    it('should filter data by trading volume', () => {
      const filtered = DataFilter.filterByMinTradingVolume(mockSubgraphData, new Decimal('30000'));
      
      expect(filtered).toHaveLength(1);
      expect(filtered[0].account).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should filter data with liquidity', () => {
      const filtered = DataFilter.filterWithLiquidity(mockSubgraphData);
      
      expect(filtered).toHaveLength(1);
      expect(filtered[0].liquidity).toBeTruthy();
    });

    it('should filter profitable traders', () => {
      const filtered = DataFilter.filterProfitable(mockSubgraphData);
      
      expect(filtered).toHaveLength(1);
      expect(filtered[0].account).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should get top traders by volume', () => {
      const top = DataFilter.getTopTraders(mockSubgraphData, 1);
      
      expect(top).toHaveLength(1);
      expect(top[0].account).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should calculate statistics', () => {
      const stats = DataStats.calculateStats(mockSubgraphData);
      
      expect(stats.totalUsers).toBe(2);
      expect(stats.totalTradingVolume.toString()).toBe('75000');
      expect(stats.totalNetProfit.toString()).toBe('2000');
      expect(stats.usersWithLiquidity).toBe(1);
      expect(stats.profitableUsers).toBe(1);
      expect(stats.averageTradingVolume.toString()).toBe('37500');
      expect(stats.averageNetProfit.toString()).toBe('1000');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid endpoint gracefully', async () => {
      const invalidClient = new SubgraphClient({
        endpoint: 'https://invalid-endpoint.example.com/graphql'
      });

      const epochBegin = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
      const epochEnded = Math.floor(Date.now() / 1000);

      await expect(invalidClient.fetchPage(epochBegin, epochEnded, 0))
        .rejects
        .toThrow();
    });

    it('should validate numeric strings', () => {
      expect(DataValidator.isValidNumericString('123.456')).toBe(true);
      expect(DataValidator.isValidNumericString('0')).toBe(true);
      expect(DataValidator.isValidNumericString('-123.456')).toBe(true);
      expect(DataValidator.isValidNumericString('')).toBe(false);
      expect(DataValidator.isValidNumericString('abc')).toBe(false);
      expect(DataValidator.isValidNumericString('12.34.56')).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should use custom rate limiting', async () => {
      const start = Date.now();
      
      const rateLimitedClient = new SubgraphClient({
        ...DEFAULT_SUBGRAPH_CONFIG,
        requestsPerSecond: 1 // Very slow for testing
      });

      // Mock the actual request to avoid network calls
      const originalExecuteQuery = (rateLimitedClient as any).executeQuery;
      (rateLimitedClient as any).executeQuery = jest.fn().mockResolvedValue({
        data: []
      });

      // Make two requests
      await rateLimitedClient.fetchPage(1000, 2000, 0);
      await rateLimitedClient.fetchPage(1000, 2000, 1000);

      const elapsed = Date.now() - start;
      
      // Should take at least 1 second due to rate limiting
      expect(elapsed).toBeGreaterThanOrEqual(900); // Allow some tolerance
    });
  });
});