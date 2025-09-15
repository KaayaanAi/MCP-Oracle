import axios, { AxiosInstance } from 'axios';
import { loggers } from '../utils/logger.js';

export interface TechnicalIndicators {
  rsi: number;
  macd: {
    value: number;
    signal: number;
    histogram: number;
    trend: 'bullish' | 'bearish' | 'neutral';
  };
  bollinger_bands: {
    upper: number;
    middle: number;
    lower: number;
    position: 'upper' | 'middle' | 'lower' | 'above' | 'below';
  };
  sma_20: number;
  sma_50: number;
  sma_200: number;
  ema_12: number;
  ema_26: number;
  volume: number;
  volatility: number;
}

export interface SupportResistance {
  support_levels: number[];
  resistance_levels: number[];
  pivot_point: number;
  strength: 'strong' | 'moderate' | 'weak';
}

export interface TechnicalAnalysis {
  symbol: string;
  indicators: TechnicalIndicators;
  support_resistance: SupportResistance;
  trend_analysis: {
    short_term: 'bullish' | 'bearish' | 'neutral';
    medium_term: 'bullish' | 'bearish' | 'neutral';
    long_term: 'bullish' | 'bearish' | 'neutral';
    overall: 'bullish' | 'bearish' | 'neutral';
    strength: number; // 0-100
  };
  signals: {
    action: 'BUY' | 'SELL' | 'HOLD' | 'STRONG_BUY' | 'STRONG_SELL';
    confidence: number; // 0-100
    reasons: string[];
  };
  last_updated: string;
}

export interface AlphaVantageResponse {
  'Meta Data': any;
  [key: string]: any;
}

export class TechnicalAnalysisService {
  private client: AxiosInstance;
  private apiKey: string;
  private baseUrl = 'https://www.alphavantage.co/query';
  private logger = loggers.technical;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      params: {
        apikey: apiKey
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        this.logger.debug(`📊 AlphaVantage API call: ${config.params?.function} for ${config.params?.symbol}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => {
        // Check for API limit messages
        if (typeof response.data === 'object' && response.data['Note']) {
          this.logger.warn('⚠️ AlphaVantage API limit reached');
          throw new Error('AlphaVantage API limit reached');
        }
        if (typeof response.data === 'object' && response.data['Error Message']) {
          this.logger.error('❌ AlphaVantage API error:', response.data['Error Message']);
          throw new Error(response.data['Error Message']);
        }
        this.logger.debug(`✅ AlphaVantage response received`);
        return response;
      },
      (error) => {
        this.logger.error('❌ AlphaVantage API error:', {
          status: error.response?.status,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get comprehensive technical analysis for a symbol
   */
  async getComprehensiveAnalysis(symbol: string): Promise<TechnicalAnalysis> {
    this.logger.info(`🔍 Getting REAL comprehensive technical analysis for ${symbol}`);

    try {
      // Get all technical indicators in parallel
      const [
        dailyData,
        rsiData,
        macdData,
        bbandData,
        smaData,
        emaData
      ] = await Promise.allSettled([
        this.getDailyPrices(symbol),
        this.getRSI(symbol),
        this.getMACD(symbol),
        this.getBollingerBands(symbol),
        this.getSMA(symbol),
        this.getEMA(symbol)
      ]);

      // Parse daily data for price analysis
      const prices = dailyData.status === 'fulfilled' ? this.parseDailyData(dailyData.value) : [];
      const currentPrice = prices.length > 0 ? prices[0].close : 0;

      // Build technical indicators
      const indicators: TechnicalIndicators = {
        rsi: rsiData.status === 'fulfilled' ? this.parseRSI(rsiData.value) : 50,
        macd: macdData.status === 'fulfilled' ? this.parseMACD(macdData.value) : {
          value: 0, signal: 0, histogram: 0, trend: 'neutral'
        },
        bollinger_bands: bbandData.status === 'fulfilled' ? this.parseBollingerBands(bbandData.value, currentPrice) : {
          upper: currentPrice * 1.02, middle: currentPrice, lower: currentPrice * 0.98, position: 'middle'
        },
        sma_20: smaData.status === 'fulfilled' ? this.parseSMA(smaData.value, 'SMA_20') : currentPrice,
        sma_50: smaData.status === 'fulfilled' ? this.parseSMA(smaData.value, 'SMA_50') : currentPrice,
        sma_200: smaData.status === 'fulfilled' ? this.parseSMA(smaData.value, 'SMA_200') : currentPrice,
        ema_12: emaData.status === 'fulfilled' ? this.parseEMA(emaData.value, 'EMA_12') : currentPrice,
        ema_26: emaData.status === 'fulfilled' ? this.parseEMA(emaData.value, 'EMA_26') : currentPrice,
        volume: this.calculateAverageVolume(prices),
        volatility: this.calculateVolatility(prices)
      };

      // Calculate support and resistance
      const supportResistance = this.calculateSupportResistance(prices, indicators);

      // Analyze trends
      const trendAnalysis = this.analyzeTrends(indicators, prices, currentPrice);

      // Generate signals
      const signals = this.generateSignals(indicators, trendAnalysis, currentPrice);

      const analysis: TechnicalAnalysis = {
        symbol,
        indicators,
        support_resistance: supportResistance,
        trend_analysis: trendAnalysis,
        signals,
        last_updated: new Date().toISOString()
      };

      this.logger.info(`✅ Generated REAL technical analysis for ${symbol}: ${signals.action} (${signals.confidence}%)`);
      return analysis;

    } catch (error) {
      this.logger.error(`❌ Failed to get technical analysis for ${symbol}:`, error);
      throw new Error(`Technical analysis failed for ${symbol}`);
    }
  }

  /**
   * Get daily price data
   */
  private async getDailyPrices(symbol: string): Promise<any> {
    const response = await this.client.get('', {
      params: {
        function: 'TIME_SERIES_DAILY_ADJUSTED',
        symbol: symbol,
        outputsize: 'compact'
      }
    });
    return response.data;
  }

  /**
   * Get RSI data
   */
  private async getRSI(symbol: string): Promise<any> {
    const response = await this.client.get('', {
      params: {
        function: 'RSI',
        symbol: symbol,
        interval: 'daily',
        time_period: 14,
        series_type: 'close'
      }
    });
    return response.data;
  }

  /**
   * Get MACD data
   */
  private async getMACD(symbol: string): Promise<any> {
    const response = await this.client.get('', {
      params: {
        function: 'MACD',
        symbol: symbol,
        interval: 'daily',
        series_type: 'close'
      }
    });
    return response.data;
  }

  /**
   * Get Bollinger Bands data
   */
  private async getBollingerBands(symbol: string): Promise<any> {
    const response = await this.client.get('', {
      params: {
        function: 'BBANDS',
        symbol: symbol,
        interval: 'daily',
        time_period: 20,
        series_type: 'close'
      }
    });
    return response.data;
  }

  /**
   * Get SMA data
   */
  private async getSMA(symbol: string): Promise<any> {
    const promises = [
      this.client.get('', {
        params: {
          function: 'SMA',
          symbol: symbol,
          interval: 'daily',
          time_period: 20,
          series_type: 'close'
        }
      }),
      this.client.get('', {
        params: {
          function: 'SMA',
          symbol: symbol,
          interval: 'daily',
          time_period: 50,
          series_type: 'close'
        }
      }),
      this.client.get('', {
        params: {
          function: 'SMA',
          symbol: symbol,
          interval: 'daily',
          time_period: 200,
          series_type: 'close'
        }
      })
    ];

    const responses = await Promise.all(promises);
    return {
      sma20: responses[0].data,
      sma50: responses[1].data,
      sma200: responses[2].data
    };
  }

  /**
   * Get EMA data
   */
  private async getEMA(symbol: string): Promise<any> {
    const promises = [
      this.client.get('', {
        params: {
          function: 'EMA',
          symbol: symbol,
          interval: 'daily',
          time_period: 12,
          series_type: 'close'
        }
      }),
      this.client.get('', {
        params: {
          function: 'EMA',
          symbol: symbol,
          interval: 'daily',
          time_period: 26,
          series_type: 'close'
        }
      })
    ];

    const responses = await Promise.all(promises);
    return {
      ema12: responses[0].data,
      ema26: responses[1].data
    };
  }

  private parseDailyData(data: any): any[] {
    const timeSeries = data['Time Series (Daily)'] || {};
    return Object.entries(timeSeries)
      .map(([date, values]: [string, any]) => ({
        date,
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseFloat(values['6. volume'])
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 100);
  }

  private parseRSI(data: any): number {
    const rsiData = data['Technical Analysis: RSI'] || {};
    const latestDate = Object.keys(rsiData)[0];
    return latestDate ? parseFloat(rsiData[latestDate]['RSI']) : 50;
  }

  private parseMACD(data: any): TechnicalIndicators['macd'] {
    const macdData = data['Technical Analysis: MACD'] || {};
    const latestDate = Object.keys(macdData)[0];

    if (!latestDate) {
      return { value: 0, signal: 0, histogram: 0, trend: 'neutral' };
    }

    const latest = macdData[latestDate];
    const macdValue = parseFloat(latest['MACD']);
    const signalValue = parseFloat(latest['MACD_Signal']);
    const histogram = parseFloat(latest['MACD_Hist']);

    return {
      value: macdValue,
      signal: signalValue,
      histogram: histogram,
      trend: macdValue > signalValue ? 'bullish' : macdValue < signalValue ? 'bearish' : 'neutral'
    };
  }

  private parseBollingerBands(data: any, currentPrice: number): TechnicalIndicators['bollinger_bands'] {
    const bbandData = data['Technical Analysis: BBANDS'] || {};
    const latestDate = Object.keys(bbandData)[0];

    if (!latestDate) {
      return {
        upper: currentPrice * 1.02,
        middle: currentPrice,
        lower: currentPrice * 0.98,
        position: 'middle'
      };
    }

    const latest = bbandData[latestDate];
    const upper = parseFloat(latest['Real Upper Band']);
    const middle = parseFloat(latest['Real Middle Band']);
    const lower = parseFloat(latest['Real Lower Band']);

    let position: 'upper' | 'middle' | 'lower' | 'above' | 'below' = 'middle';
    if (currentPrice > upper) position = 'above';
    else if (currentPrice < lower) position = 'below';
    else if (currentPrice > middle) position = 'upper';
    else position = 'lower';

    return { upper, middle, lower, position };
  }

  private parseSMA(data: any, type: 'SMA_20' | 'SMA_50' | 'SMA_200'): number {
    let smaData;

    if (type === 'SMA_20') smaData = data.sma20?.['Technical Analysis: SMA'] || {};
    else if (type === 'SMA_50') smaData = data.sma50?.['Technical Analysis: SMA'] || {};
    else smaData = data.sma200?.['Technical Analysis: SMA'] || {};

    const latestDate = Object.keys(smaData)[0];
    return latestDate ? parseFloat(smaData[latestDate]['SMA']) : 0;
  }

  private parseEMA(data: any, type: 'EMA_12' | 'EMA_26'): number {
    const emaData = type === 'EMA_12'
      ? data.ema12?.['Technical Analysis: EMA'] || {}
      : data.ema26?.['Technical Analysis: EMA'] || {};

    const latestDate = Object.keys(emaData)[0];
    return latestDate ? parseFloat(emaData[latestDate]['EMA']) : 0;
  }

  private calculateAverageVolume(prices: any[]): number {
    if (prices.length === 0) return 0;
    const totalVolume = prices.slice(0, 20).reduce((sum, price) => sum + (price.volume || 0), 0);
    return totalVolume / Math.min(prices.length, 20);
  }

  private calculateVolatility(prices: any[]): number {
    if (prices.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < Math.min(prices.length, 30); i++) {
      const dailyReturn = (prices[i - 1].close - prices[i].close) / prices[i].close;
      returns.push(dailyReturn);
    }

    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    return Math.sqrt(variance) * Math.sqrt(252) * 100; // Annualized volatility as percentage
  }

  private calculateSupportResistance(prices: any[], indicators: TechnicalIndicators): SupportResistance {
    if (prices.length === 0) {
      return {
        support_levels: [],
        resistance_levels: [],
        pivot_point: 0,
        strength: 'weak'
      };
    }

    const recent = prices.slice(0, 50);
    const highs = recent.map(p => p.high).sort((a, b) => b - a);
    const lows = recent.map(p => p.low).sort((a, b) => a - b);

    // Calculate pivot point
    const lastPrice = prices[0];
    const pivotPoint = (lastPrice.high + lastPrice.low + lastPrice.close) / 3;

    // Identify support and resistance levels
    const resistanceLevels = [
      highs[0], // Recent high
      indicators.bollinger_bands.upper,
      indicators.sma_200 > lastPrice.close ? indicators.sma_200 : 0
    ].filter(level => level > 0 && level > lastPrice.close).slice(0, 3);

    const supportLevels = [
      lows[0], // Recent low
      indicators.bollinger_bands.lower,
      indicators.sma_200 < lastPrice.close ? indicators.sma_200 : 0
    ].filter(level => level > 0 && level < lastPrice.close).slice(0, 3);

    // Determine strength
    const strength = resistanceLevels.length >= 2 && supportLevels.length >= 2 ? 'strong' :
                    resistanceLevels.length >= 1 && supportLevels.length >= 1 ? 'moderate' : 'weak';

    return {
      support_levels: supportLevels,
      resistance_levels: resistanceLevels,
      pivot_point: pivotPoint,
      strength
    };
  }

  private analyzeTrends(indicators: TechnicalIndicators, prices: any[], currentPrice: number): TechnicalAnalysis['trend_analysis'] {
    let bullishSignals = 0;
    let bearishSignals = 0;

    // RSI analysis
    if (indicators.rsi < 30) bullishSignals++; // Oversold
    else if (indicators.rsi > 70) bearishSignals++; // Overbought
    else if (indicators.rsi > 50) bullishSignals += 0.5;

    // MACD analysis
    if (indicators.macd.trend === 'bullish') bullishSignals++;
    else if (indicators.macd.trend === 'bearish') bearishSignals++;

    // Moving average analysis
    if (currentPrice > indicators.sma_20 && indicators.sma_20 > indicators.sma_50) bullishSignals++;
    if (currentPrice < indicators.sma_20 && indicators.sma_20 < indicators.sma_50) bearishSignals++;

    if (currentPrice > indicators.sma_200) bullishSignals += 0.5;
    else bearishSignals += 0.5;

    // Bollinger Bands analysis
    if (indicators.bollinger_bands.position === 'below') bullishSignals += 0.5;
    else if (indicators.bollinger_bands.position === 'above') bearishSignals += 0.5;

    // Price momentum
    if (prices.length >= 3) {
      const recent3 = prices.slice(0, 3);
      const isUptrend = recent3[0].close > recent3[1].close && recent3[1].close > recent3[2].close;
      const isDowntrend = recent3[0].close < recent3[1].close && recent3[1].close < recent3[2].close;

      if (isUptrend) bullishSignals++;
      if (isDowntrend) bearishSignals++;
    }

    const totalSignals = bullishSignals + bearishSignals;
    const strength = Math.round((Math.abs(bullishSignals - bearishSignals) / totalSignals) * 100);

    let overall: 'bullish' | 'bearish' | 'neutral';
    if (bullishSignals > bearishSignals + 1) overall = 'bullish';
    else if (bearishSignals > bullishSignals + 1) overall = 'bearish';
    else overall = 'neutral';

    return {
      short_term: indicators.rsi < 40 ? 'bullish' : indicators.rsi > 60 ? 'bearish' : 'neutral',
      medium_term: currentPrice > indicators.sma_50 ? 'bullish' : 'bearish',
      long_term: currentPrice > indicators.sma_200 ? 'bullish' : 'bearish',
      overall,
      strength: strength || 50
    };
  }

  private generateSignals(indicators: TechnicalIndicators, trendAnalysis: any, currentPrice: number): TechnicalAnalysis['signals'] {
    const reasons: string[] = [];
    let score = 0;

    // RSI signals
    if (indicators.rsi < 25) {
      score += 2;
      reasons.push('RSI indicates oversold conditions');
    } else if (indicators.rsi < 35) {
      score += 1;
      reasons.push('RSI approaching oversold levels');
    } else if (indicators.rsi > 75) {
      score -= 2;
      reasons.push('RSI indicates overbought conditions');
    } else if (indicators.rsi > 65) {
      score -= 1;
      reasons.push('RSI approaching overbought levels');
    }

    // MACD signals
    if (indicators.macd.trend === 'bullish' && indicators.macd.histogram > 0) {
      score += 1.5;
      reasons.push('MACD shows bullish momentum');
    } else if (indicators.macd.trend === 'bearish' && indicators.macd.histogram < 0) {
      score -= 1.5;
      reasons.push('MACD shows bearish momentum');
    }

    // Moving average signals
    if (currentPrice > indicators.sma_20 && indicators.sma_20 > indicators.sma_50 && indicators.sma_50 > indicators.sma_200) {
      score += 2;
      reasons.push('All moving averages aligned bullishly');
    } else if (currentPrice < indicators.sma_20 && indicators.sma_20 < indicators.sma_50 && indicators.sma_50 < indicators.sma_200) {
      score -= 2;
      reasons.push('All moving averages aligned bearishly');
    }

    // Bollinger Bands signals
    if (indicators.bollinger_bands.position === 'below') {
      score += 1;
      reasons.push('Price below lower Bollinger Band - potential reversal');
    } else if (indicators.bollinger_bands.position === 'above') {
      score -= 1;
      reasons.push('Price above upper Bollinger Band - potential pullback');
    }

    // Trend alignment
    if (trendAnalysis.overall === 'bullish' && trendAnalysis.strength > 70) {
      score += 1;
      reasons.push('Strong bullish trend alignment');
    } else if (trendAnalysis.overall === 'bearish' && trendAnalysis.strength > 70) {
      score -= 1;
      reasons.push('Strong bearish trend alignment');
    }

    // Determine action and confidence
    let action: 'BUY' | 'SELL' | 'HOLD' | 'STRONG_BUY' | 'STRONG_SELL';
    let confidence: number;

    if (score >= 4) {
      action = 'STRONG_BUY';
      confidence = Math.min(95, 70 + Math.abs(score) * 5);
    } else if (score >= 2) {
      action = 'BUY';
      confidence = Math.min(85, 60 + Math.abs(score) * 8);
    } else if (score <= -4) {
      action = 'STRONG_SELL';
      confidence = Math.min(95, 70 + Math.abs(score) * 5);
    } else if (score <= -2) {
      action = 'SELL';
      confidence = Math.min(85, 60 + Math.abs(score) * 8);
    } else {
      action = 'HOLD';
      confidence = Math.max(40, 50 - Math.abs(score) * 5);
      reasons.push('Mixed signals suggest holding position');
    }

    return {
      action,
      confidence: Math.round(confidence),
      reasons
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('', {
        params: {
          function: 'TIME_SERIES_INTRADAY',
          symbol: 'IBM',
          interval: '5min',
          outputsize: 'compact'
        }
      });

      this.logger.info('✅ Technical Analysis service health check passed');
      return true;
    } catch (error) {
      this.logger.error('❌ Technical Analysis service health check failed:', error);
      return false;
    }
  }
}