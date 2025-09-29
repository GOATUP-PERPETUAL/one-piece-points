import Decimal from 'decimal.js';
import { SubgraphClient } from './subgraph-client';
import { 
  transformLeaderboards,
  DataValidator,
  DataStats
} from './data-transformer';
import {
  calculateUserPoints,
  CalculationConfig,
} from './index';

/**
 * Complete example showing how to fetch data from subgraph and calculate points
 */
async function completeExample() {
  console.log('🚀 Complete Subgraph to Points Calculation Example\n');

  // Step 1: Initialize the subgraph client
  console.log('📡 Setting up subgraph client...');
  const client = new SubgraphClient({
    requestsPerSecond: 10, // Conservative rate limiting
    maxRetries: 3,
    retryDelay: 1000
  });

  // Step 2: Define time period (last 7 days)
  const now = Math.floor(Date.now() / 1000);
  const start = now - (7 * 24 * 60 * 60);
  const stop = now;
  
  console.log(`⏰ Time period: ${new Date(start * 1000).toISOString()} to ${new Date(stop * 1000).toISOString()}`);

  try {
    // Step 2: Fetch data with progress tracking
    console.log('\n📦 Fetching data from subgraph...');
    const rawData = await client.fetchWithOptions({
      epochBegin: start,
      epochEnded: stop,
      maxRecords: 0, // Limit records, 0 for all
      onProgress: (pagination) => {
        console.log(`   📊 Progress: ${pagination.totalFetched} records fetched, Skip: ${pagination.skip}, Has more: ${pagination.hasMore}`);
      },
      onError: (error, skip) => {
        console.error(`   ❌ Error at skip ${skip}:`, error.message);
        console.log('   🔄 Retrying...');
        return true; // Retry on error
      }
    });

    console.log(`✅ Successfully fetched ${rawData.length} records\n`);

    // Step 3: Validate the data
    console.log('🔍 Validating data...');
    const validation = DataValidator.validateLeaderboards(rawData);
    console.log(`   ✅ Valid records: ${validation.validCount}`);
    console.log(`   ❌ Invalid records: ${validation.invalidCount}`);
    
    if (validation.invalidCount > 0) {
      console.log('   ⚠️  Invalid records details:');
      validation.errors.slice(0, 3).forEach(error => {
        console.log(`     - Account ${error.account}: ${error.errors.join(', ')}`);
      });
      if (validation.errors.length > 3) {
        console.log(`     ... and ${validation.errors.length - 3} more`);
      }
    }

    // Step 4: Calculate statistics
    console.log('\n📊 Data Statistics:');
    const stats = DataStats.calculateStats(rawData);
    console.log(`   👥 Total users: ${stats.totalUsers}`);
    console.log(`   💹 Total trading volume: ${stats.totalTradingVolume.toFixed(2)} USD`);
    console.log(`   💰 Total net profit: ${stats.totalNetProfit.toFixed(2)} USD`);
    console.log(`   📈 Average trading volume: ${stats.averageTradingVolume.toFixed(2)} USD`);
    console.log(`   💵 Average net profit: ${stats.averageNetProfit.toFixed(2)} USD`);
    console.log(`   🏊 Users with liquidity: ${stats.usersWithLiquidity}`);
    console.log(`   📈 Profitable users: ${stats.profitableUsers}`);

    console.log('\n🔄 Transforming data for point calculation...');
    const transformedData = transformLeaderboards(rawData);
    console.log(`✅ Transformed ${transformedData.length} records`);

    const config: CalculationConfig = {
      liquidityRate: new Decimal(0.1).div(new Decimal(3600)),      // 0.1x multiplier per hour for liquidity
      tradeProfitRate: new Decimal(1),    // 1x multiplier for profits  
      tradeRate: new Decimal(5),         // 5x multiplier for volume (5% of volume)
    };

    console.log('\n⚙️  Point Calculation Configuration:');

    console.log('\n🧮 Calculating points...');
    const pointResults = calculateUserPoints(
      transformedData,
      config,
      start,
      stop,
      Math.floor(Date.now() / 1000) > stop, // true when calculating the history points
    );

    console.log(`✅ Calculated points for ${pointResults.length} users\n`);

    // Step 5: Display results
    console.log('🏆 Point Calculation Results (Top 10):');
    console.log('='.repeat(120));
    
    const sortedResults = pointResults
      .map(result => ({
        ...result,
        totalPoints: result.lp_usd_hours.add(result.volume_usd).add(result.realized_pnl_net_usd)
      }))
      .sort((a, b) => b.totalPoints.minus(a.totalPoints).toNumber())
      .slice(0, 10);

    sortedResults.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.account}`);
      console.log(`   🏊 Liquidity Points: ${result.lp_usd_hours.toFixed(2).padStart(10)}`);
      console.log(`   📊 Trade Points:     ${result.volume_usd.toFixed(2).padStart(10)}`);
      console.log(`   💰 Profit Points:    ${result.realized_pnl_net_usd.toFixed(2).padStart(10)}`);
      console.log(`   🎯 Total Points:     ${result.totalPoints.toFixed(2).padStart(10)}`);
    });

    const totalLiquidityPoints = pointResults.reduce((sum, r) => sum.add(r.lp_usd_hours), new Decimal(0));
    const totalTradePoints = pointResults.reduce((sum, r) => sum.add(r.volume_usd), new Decimal(0));
    const totalProfitPoints = pointResults.reduce((sum, r) => sum.add(r.realized_pnl_net_usd), new Decimal(0));
    const grandTotal = totalLiquidityPoints.add(totalTradePoints).add(totalProfitPoints);

    console.log('\n' + '='.repeat(120));
    console.log('📊 Summary Statistics:');
    console.log(`   🏊 Total Liquidity Points: ${totalLiquidityPoints.toFixed(2)}`);
    console.log(`   📊 Total Trade Points:     ${totalTradePoints.toFixed(2)}`);
    console.log(`   💰 Total Profit Points:    ${totalProfitPoints.toFixed(2)}`);
    console.log(`   🎯 Grand Total Points:     ${grandTotal.toFixed(2)}`);
    console.log('='.repeat(120));

    console.log('\n✅ Example completed successfully!');

  } catch (error) {
    console.error('❌ Error during execution:', error);
    
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack trace:', error.stack);
    }
  }
}

/**
 * Demonstration of error handling and retry logic
 */
async function errorHandlingExample() {
  console.log('🚀 Error Handling Example\n');

  // Create client with aggressive settings to demonstrate error handling
  const client = new SubgraphClient({
    requestsPerSecond: 10, // Might hit rate limits
    maxRetries: 2,
    retryDelay: 500
  });

  const now = Math.floor(Date.now() / 1000);
  const oneWeekAgo = now - (7 * 24 * 60 * 60);

  try {
    console.log('📡 Attempting to fetch data with aggressive rate limiting...');
    
    const result = await client.fetchWithOptions({
      epochBegin: oneWeekAgo,
      epochEnded: now,
      maxRecords: 500,
      onProgress: (pagination) => {
        console.log(`   📊 Progress: ${pagination.totalFetched} records`);
      },
      onError: (error, skip) => {
        console.log(`   ⚠️  Error at skip ${skip}: ${error.message}`);
        console.log(`   🔄 Retrying...`);
        return true; // Retry
      }
    });

    console.log(`✅ Successfully fetched ${result.length} records despite potential errors`);

  } catch (error) {
    console.error('❌ Final error after retries:', error);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const example = args[0] || 'simple';

  switch (example) {
    case 'complete':
      await completeExample();
      break;
    case 'error':
      await errorHandlingExample();
      break;
    case 'simple':
    default:
      await completeExample();
      break;
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  completeExample,
  errorHandlingExample
};