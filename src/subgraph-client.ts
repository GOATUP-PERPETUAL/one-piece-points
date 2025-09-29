import { GraphQLClient } from 'graphql-request';
import {
  SubgraphConfig,
  DEFAULT_SUBGRAPH_CONFIG,
  SubgraphQueryVariables,
  SubgraphQueryResponse,
  SubgraphLeaderboardResponse,
  FetchResult,
  PaginationInfo,
  LEADERBOARD_QUERY,
  SubgraphError,
  RateLimitError,
  NetworkError
} from './subgraph-types';

/**
 * SubgraphClient - A robust client for fetching data from The Graph subgraph
 * with automatic pagination, rate limiting, and error handling
 */
export class SubgraphClient {
  private client: GraphQLClient;
  private config: SubgraphConfig;
  private lastRequestTime: number = 0;
  private requestQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue: boolean = false;

  constructor(config: Partial<SubgraphConfig> = {}) {
    this.config = { ...DEFAULT_SUBGRAPH_CONFIG, ...config };
    this.client = new GraphQLClient(this.config.endpoint, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Rate limiting helper - ensures we don't exceed the specified requests per second
   */
  private async waitForRateLimit(): Promise<void> {
    if (!this.config.requestsPerSecond) return;

    const minInterval = 1000 / this.config.requestsPerSecond;
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    
    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Execute a GraphQL query with retry logic and error handling
   */
  private async executeQuery<T>(
    query: string,
    variables: Record<string, any>,
    retryCount = 0
  ): Promise<T> {
    try {
      await this.waitForRateLimit();
      
      const result = await this.client.request<T>(query, variables);
      return result;
    } catch (error: any) {
      // Handle different types of errors
      if (error.response?.status === 429) {
        throw new RateLimitError('Rate limit exceeded');
      }
      
      if (error.response?.status >= 500) {
        // Server error - retry if we have retries left
        if (retryCount < (this.config.maxRetries || 3)) {
          const delay = (this.config.retryDelay || 1000) * Math.pow(2, retryCount);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.executeQuery(query, variables, retryCount + 1);
        }
        throw new NetworkError(`Server error: ${error.message}`, error.response.status);
      }
      
      if (error.response?.status >= 400) {
        throw new SubgraphError(`Client error: ${error.message}`, 'CLIENT_ERROR', error.response.status);
      }
      
      // Network or other errors
      if (retryCount < (this.config.maxRetries || 3)) {
        const delay = (this.config.retryDelay || 1000) * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.executeQuery(query, variables, retryCount + 1);
      }
      
      throw new NetworkError(`Network error: ${error.message}`);
    }
  }

  /**
   * Fetch a single page of leaderboard data
   */
  async fetchPage(
    epochBegin: number,
    epochEnded: number,
    skip: number = 0
  ): Promise<FetchResult> {
    const variables: SubgraphQueryVariables = {
      skip,
      epochBegin,
      epochEnded
    };

    const response = await this.executeQuery<SubgraphQueryResponse>(
      LEADERBOARD_QUERY,
      variables
    );

    const data = response.data || [];
    const hasMore = data.length === 1000; // If we got exactly 1000 records, there might be more

    return {
      data,
      pagination: {
        skip,
        hasMore,
        totalFetched: skip + data.length
      }
    };
  }

  /**
   * Fetch all leaderboard data with automatic pagination
   */
  async fetchAllData(
    epochBegin: number,
    epochEnded: number,
    onProgress?: (pagination: PaginationInfo) => void
  ): Promise<SubgraphLeaderboardResponse[]> {
    const allData: SubgraphLeaderboardResponse[] = [];
    let skip = 0;
    let hasMore = true;

    console.log(`🚀 Starting data fetch from ${new Date(epochBegin * 1000).toISOString()} to ${new Date(epochEnded * 1000).toISOString()}`);

    while (hasMore) {
      try {
        console.log(`📦 Fetching batch ${Math.floor(skip / 1000) + 1} (skip: ${skip})`);
        
        const result = await this.fetchPage(epochBegin, epochEnded, skip);
        
        allData.push(...result.data);
        hasMore = result.pagination.hasMore;
        skip += 1000;

        console.log(`✅ Fetched ${result.data.length} records. Total: ${allData.length}`);
        
        // Call progress callback if provided
        if (onProgress) {
          onProgress({
            skip,
            hasMore,
            totalFetched: allData.length
          });
        }

        // Break if we got less than 1000 records (end of data)
        if (result.data.length < 1000) {
          hasMore = false;
        }

      } catch (error) {
        console.error(`❌ Error fetching batch at skip ${skip}:`, error);
        
        if (error instanceof RateLimitError) {
          console.log('⏱️  Rate limit hit, waiting before retry...');
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
          continue; // Retry the same batch
        }
        
        throw error;
      }
    }

    console.log(`🎉 Data fetch completed! Total records: ${allData.length}`);
    return allData;
  }

  /**
   * Fetch data with custom filters and options
   */
  async fetchWithOptions(options: {
    epochBegin: number;
    epochEnded: number;
    maxRecords?: number;
    startFrom?: number;
    onProgress?: (pagination: PaginationInfo) => void;
    onError?: (error: Error, skip: number) => boolean; // Return true to retry, false to stop
  }): Promise<SubgraphLeaderboardResponse[]> {
    const {
      epochBegin,
      epochEnded,
      maxRecords,
      startFrom = 0,
      onProgress,
      onError
    } = options;

    const allData: SubgraphLeaderboardResponse[] = [];
    let skip = startFrom;
    let hasMore = true;

    while (hasMore && (!maxRecords || allData.length < maxRecords)) {
      try {
        const result = await this.fetchPage(epochBegin, epochEnded, skip);
        
        const recordsToAdd = maxRecords 
          ? result.data.slice(0, Math.max(0, maxRecords - allData.length))
          : result.data;
        
        allData.push(...recordsToAdd);
        hasMore = result.pagination.hasMore && (!maxRecords || allData.length < maxRecords);
        skip += 1000;

        if (onProgress) {
          onProgress({
            skip,
            hasMore,
            totalFetched: allData.length
          });
        }

        if (result.data.length < 1000) {
          hasMore = false;
        }

      } catch (error) {
        const shouldRetry = onError ? onError(error as Error, skip) : false;
        
        if (!shouldRetry) {
          throw error;
        }
        
        // If retrying, don't increment skip
        continue;
      }
    }

    return allData;
  }

  /**
   * Get basic statistics about the available data
   */
  async getDataStats(epochBegin: number, epochEnded: number): Promise<{
    totalRecords: number;
    sampleData: SubgraphLeaderboardResponse[];
  }> {
    try {
      // Fetch first page to get sample data
      const firstPage = await this.fetchPage(epochBegin, epochEnded, 0);
      
      // If we got less than 1000 records, that's all the data
      if (firstPage.data.length < 1000) {
        return {
          totalRecords: firstPage.data.length,
          sampleData: firstPage.data.slice(0, 5)
        };
      }

      // For a rough estimate, we could fetch a few more pages
      // But for now, we'll just indicate there are at least 1000 records
      return {
        totalRecords: firstPage.data.length, // This is a minimum
        sampleData: firstPage.data.slice(0, 5)
      };
    } catch (error) {
      throw new SubgraphError(`Failed to get data stats: ${error}`);
    }
  }

  /**
   * Update the client configuration
   */
  updateConfig(newConfig: Partial<SubgraphConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Create new GraphQL client if endpoint changed
    if (newConfig.endpoint) {
      this.client = new GraphQLClient(this.config.endpoint, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): SubgraphConfig {
    return { ...this.config };
  }
}