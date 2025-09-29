# Perpetual Points Calculator

A TypeScript library for calculating perpetual trading points based on liquidity and trading metrics. This library provides functions to compute user points from trading volumes, liquidity provision, and profit/loss data.

## Features

- 🎯 **Accurate Point Calculation**: Calculate points based on liquidity, trading volume, and profit metrics
- 📊 **Liquidity Integration**: Compute liquidity points using time-weighted integration
- 🔢 **High Precision Math**: Uses Decimal.js for precise floating-point calculations
- ⚡ **TypeScript Support**: Full TypeScript support with comprehensive type definitions
- 🧪 **Well Tested**: Comprehensive unit test coverage
- 📈 **Configurable Limits**: Support for rate limits and caps on different point types
- 🌐 **Subgraph Integration**: Built-in GraphQL client for fetching data from The Graph subgraph
- 🔄 **Automatic Pagination**: Handle large datasets with automatic pagination and rate limiting
- 📊 **Data Validation**: Comprehensive data validation and transformation utilities
- 🛡️ **Error Handling**: Robust error handling with retry logic and graceful degradation

## Installation

```bash
npm install
```

## Quick Start

### Basic Point Calculation

```typescript
import Decimal from 'decimal.js';
import { calculateUserPoints, CalculationConfig, TimeContext, PerpLeaderboard } from './src/index';

// Define configuration
const config: CalculationConfig = {
  liquidityRate: new Decimal(1.5),
  liquidityLimit: new Decimal(10000),
  tradeProfitRate: new Decimal(2.0),
  tradeProfitLimit: new Decimal(5000),
  tradeRate: new Decimal(1.0),
  tradeLimit: new Decimal(8000)
};

// Define time context
const timeContext: TimeContext = {
  start: () => 1640995200, // 2022-01-01 00:00:00 UTC
  reachAt: () => 1672531200 // 2023-01-01 00:00:00 UTC
};

// Calculate points with your data
const results = calculateUserPoints(
  leaderboards,
  config,
  timeContext,
  1672531200, // stopTime
  false // overtime
);

console.log('User Points:', results);
```

### Fetching Data from Subgraph

```typescript
import { SubgraphClient, transformLeaderboards } from './src';

// Create client
const client = new SubgraphClient();

// Define time period
const now = Math.floor(Date.now() / 1000);
const oneWeekAgo = now - (7 * 24 * 60 * 60);

// Fetch data
const rawData = await client.fetchAllData(oneWeekAgo, now);

// Transform for calculation
const leaderboards = transformLeaderboards(rawData);

// Calculate points
const results = calculateUserPoints(leaderboards, config, timeContext, now, false);
```

## API Reference

### Main Functions

#### `SubgraphClient`

A robust GraphQL client for fetching data from The Graph subgraph with automatic pagination and error handling.

```typescript
const client = new SubgraphClient({
  endpoint: 'your-subgraph-endpoint',
  requestsPerSecond: 5,
  maxRetries: 3,
  retryDelay: 1000
});

// Fetch all data with pagination
const data = await client.fetchAllData(startTime, endTime);

// Fetch single page
const page = await client.fetchPage(startTime, endTime, skip);
```

#### `transformLeaderboards`

Transforms raw subgraph data into calculation-ready format.

```typescript
import { transformLeaderboards } from './src/data-transformer';

const leaderboards = transformLeaderboards(rawSubgraphData);
```

#### `calculateUserPoints`

Calculates user points based on leaderboard data and configuration.

```typescript
function calculateUserPoints(
  leaderboards: PerpLeaderboard[],
  config: CalculationConfig,
  timeContext: TimeContext,
  stopTime: number,
  overtime: boolean
): UserPoints[]
```

**Parameters:**
- `leaderboards`: Array of user leaderboard data
- `config`: Calculation configuration with rates and limits
- `timeContext`: Time context providing start and reach timestamps
- `stopTime`: End timestamp for calculations
- `overtime`: Whether to handle overtime scenarios

**Returns:** Array of `UserPoints` objects containing calculated points for each user.

#### `calculateLiquidityPointBase`

Calculates the base liquidity points using time-weighted integration.

```typescript
function calculateLiquidityPointBase(
  liquidity: PerpLiquidity,
  startTime: number,
  endTime: number
): Decimal
```

**Parameters:**
- `liquidity`: Liquidity data with start and end snapshots
- `startTime`: Calculation start time
- `endTime`: Calculation end time

**Returns:** Base liquidity points as a Decimal value.

### Data Structures

#### `PerpLeaderboard`

Main data structure representing a user's trading activity:

```typescript
interface PerpLeaderboard {
  account: string;
  tradingVolume: Decimal;
  conditionTradeVolume: Decimal;
  swap: Decimal;
  netProfit: Decimal;
  latestUpdateTimestamp: number;
  start: PerpLeaderboardSnap[];
  ended: PerpLeaderboardSnap[];
  liquidity: PerpLiquidity;
}
```

#### `CalculationConfig`

Configuration for point calculation rates and limits:

```typescript
interface CalculationConfig {
  liquidityRate: Decimal;      // Rate for liquidity points
  liquidityLimit: Decimal;     // Maximum liquidity points
  tradeProfitRate: Decimal;    // Rate for profit points
  tradeProfitLimit: Decimal;   // Maximum profit points
  tradeRate: Decimal;          // Rate for trade points
  tradeLimit: Decimal;         // Maximum trade points
}
```

#### `UserPoints`

Result structure containing calculated points:

```typescript
interface UserPoints {
  account: string;
  liquidityPoint: Decimal;     // Points from liquidity provision
  tradePoint: Decimal;         // Points from trading volume
  tradeProfitPoint: Decimal;   // Points from profitable trading
}
```

#### `SubgraphClient Configuration`

Configuration options for the subgraph client:

```typescript
interface SubgraphConfig {
  endpoint: string;            // GraphQL endpoint URL
  requestsPerSecond?: number;  // Rate limiting (default: 5)
  maxRetries?: number;         // Maximum retry attempts (default: 3)
  retryDelay?: number;         // Delay between retries in ms (default: 1000)
}
```

## Point Calculation Logic

### Liquidity Points

Liquidity points are calculated using time-weighted integration of liquidity provision:

1. **Time Segmentation**: The calculation period is divided into segments based on liquidity snapshots
2. **Linear Interpolation**: Average liquidity between start and end snapshots
3. **Time Weighting**: Multiply average liquidity by time duration
4. **Rate Application**: Apply the configured liquidity rate
5. **Limit Enforcement**: Cap at the maximum liquidity limit if configured

### Trade Points

Trade points are based on trading volume:

1. **Volume Calculation**: Subtract baseline volume from start snapshots
2. **Overtime Handling**: Use ended snapshots if user activity exceeds time limits
3. **Rate Application**: Apply the configured trade rate
4. **Limit Enforcement**: Cap at the maximum trade limit if configured

### Profit Points

Profit points are calculated from net trading profits:

1. **Profit Calculation**: Only positive net profits contribute to points
2. **Baseline Adjustment**: Subtract start snapshot profits if available
3. **Overtime Handling**: Similar to trade points for consistency
4. **Rate Application**: Apply the configured profit rate
5. **Limit Enforcement**: Cap at the maximum profit limit if configured

## Development

### Build

```bash
npm run build
```

### Test

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Examples

```bash
# Complete workflow example (requires network)
npm run example:complete

# Error handling demonstration
npm run example:error
```

### Development Mode

```bash
npm run dev
```

## Testing

The library includes comprehensive unit tests covering:

- ✅ Basic point calculations for all three point types
- ✅ Liquidity integration with various time scenarios
- ✅ Limit enforcement and boundary conditions
- ✅ Overtime handling and edge cases
- ✅ Multi-user calculations
- ✅ Negative value handling
- ✅ Empty data scenarios

Run tests with:

```bash
npm test
```

## Examples

### Basic Usage

```typescript
import { calculateUserPoints } from './src/index';

// Minimal configuration
const config = {
  liquidityRate: new Decimal(1),
  tradeProfitRate: new Decimal(1),
  tradeRate: new Decimal(1),
};

const timeContext = {
  start: () => Date.now() - 86400000, // 24 hours ago
  reachAt: () => Date.now()
};

const results = calculateUserPoints(leaderboards, config, timeContext, Date.now(), false);
```

### With Limits and Custom Rates

```typescript
const config = {
  liquidityRate: new Decimal(2.5),     // 2.5x multiplier
  tradeProfitRate: new Decimal(3.0),   // 3x multiplier for profits
  tradeRate: new Decimal(0.1),         // 0.1x multiplier for volume
};
```

## License

MIT License

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

If you encounter any issues or have questions, please open an issue on the GitHub repository.