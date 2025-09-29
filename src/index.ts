import Decimal from 'decimal.js';

// 定义数据结构
export interface PerpLiquiditySnap {
  id: string;
  lp: Decimal;
  basePoints: Decimal;
  timestamp: number;
}

export interface PerpLiquidity {
  account: string;
  lp: Decimal;
  start: PerpLiquiditySnap[];
  ended: PerpLiquiditySnap[];
}

export interface PerpLeaderboardSnap {
  tradingVolume: Decimal;
  conditionTradeVolume: Decimal;
  swap: Decimal;
  netProfit: Decimal;
}

export interface PerpLeaderboard {
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

// 配置类型
export interface CalculationConfig {
  liquidityRate: Decimal;  // point/second
  tradeProfitRate: Decimal;
  tradeRate: Decimal;
}

// 计算结果类型
export interface UserPoints {
  account: string;
  lp_usd_hours: Decimal;
  volume_usd: Decimal;
  realized_pnl_net_usd: Decimal;
}

/**
 * 计算流动性积分基础值（等效 Golang 的 calculateLiquidityPointBase）
 * 
 * @param liquidity 流动性数据
 * @param startTime 时间段起始
 * @param endTime 时间段结束
 * @returns 流动性积分
 */
export function calculateLiquidityPointBase(
  liquidity: PerpLiquidity,
  startTime: number,
  endTime: number
): Decimal {
  // 如果无快照数据，返回0
  if (liquidity.ended.length === 0) {
    return new Decimal(0);
  }

  const startSnap: PerpLiquiditySnap | null = liquidity.start[0];
  const endSnap = liquidity.ended[0];
  
  // 检查时间段有效性
  if (endSnap.timestamp < startTime) {
    return new Decimal(0);
  }

  let integral = endSnap.basePoints;
  if (endSnap.timestamp < endTime) {
    const delterPoint = new Decimal(endTime - endSnap.timestamp).mul(endSnap.lp)
    integral = integral.add(delterPoint);
  }
  if (startSnap) {
    let beforeBasePoints = startSnap.basePoints;
    if (startSnap.timestamp < startTime) {
      const delterPoint = new Decimal(startTime - startSnap.timestamp).mul(startSnap.lp)
      beforeBasePoints = beforeBasePoints.add(delterPoint);
    }
    integral = integral.sub(beforeBasePoints);
  }

  return integral;
}

/**
 * 主计算函数
 * 
 * @param leaderboards 子图查询结果（已分页合并）
 * @param config 计算配置
 * @param timeContext 时间上下文
 * @param stopTime 结束时间戳
 * @param overtime 当前子图最新时间（系统时间）是否超过结束时间
 * @returns 用户点数计算结果
 */
export function calculateUserPoints(
  leaderboards: PerpLeaderboard[],
  config: CalculationConfig,
  startTime: number,
  stopTime: number,
  overtime: boolean
): UserPoints[] {
  return leaderboards.map(lead => {
    // 初始化用户点数
    const result: UserPoints = {
      account: lead.account,
      lp_usd_hours: new Decimal(0),
      volume_usd: new Decimal(0),
      realized_pnl_net_usd: new Decimal(0)
    };

    // ================== 计算流动性点数 ==================
    if (lead.liquidity) {
      const baseIntegral = calculateLiquidityPointBase(
        lead.liquidity,
        startTime,
        stopTime
      );
      
      const liquidityPoint = baseIntegral.mul(config.liquidityRate);
      // 确保非负
      result.lp_usd_hours = liquidityPoint.isNegative() 
        ? new Decimal(0) 
        : liquidityPoint;
    }

    // ================== 计算交易点数 ==================
    let tradeVolume = lead.tradingVolume;
    if (overtime && lead.latestUpdateTimestamp > stopTime && lead.ended.length > 0) {
      tradeVolume = lead.ended[0].tradingVolume;
    }
    
    // 处理起始快照
    if (lead.start.length > 0) {
      tradeVolume = tradeVolume.sub(lead.start[0].tradingVolume);
    }
    
    const tradePoint = tradeVolume.mul(config.tradeRate); 
    // 确保非负
    result.volume_usd = tradePoint.isNegative() ? new Decimal(0) : tradePoint;

    // ================== 计算交易利润点数 ==================
    let netProfit = lead.netProfit;
    if (overtime && lead.latestUpdateTimestamp > stopTime && lead.ended.length > 0) {
      netProfit = lead.ended[0].netProfit;
    }
    
    // 处理起始快照
    if (lead.start.length > 0) {
      netProfit = netProfit.sub(lead.start[0].netProfit);
    }
    
    
    let tradeProfitPoint = new Decimal(0);
    if (netProfit.gt(0)) {
      tradeProfitPoint = netProfit.mul(config.tradeProfitRate);
    }
    
    // 确保非负
    result.realized_pnl_net_usd = tradeProfitPoint.isNegative() 
      ? new Decimal(0) 
      : tradeProfitPoint;

    return result;
  });
}