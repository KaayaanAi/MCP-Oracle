import axios, { AxiosInstance } from 'axios';
import type { TechnicalIndicators } from '../types/index.js';
import { loggers } from '../utils/logger.js';

export interface AlphaVantageTimeSeriesData {
  [date: string]: {
    '1. open': string;
    '2. high': string;
    '3. low': string;
    '4. close': string;
    '5. volume': string;
  };
}

export interface AlphaVantageResponse {
  'Meta Data': {
    '1. Information': string;
    '2. Symbol': string;
    '3. Last Refreshed': string;
    '4. Time Zone': string;
  };
  'Time Series (Daily)'?: AlphaVantageTimeSeriesData;
  'Time Series (60min)'?: AlphaVantageTimeSeriesData;
}

export interface TechnicalIndicatorResponse {
  'Meta Data': {
    '1: Symbol': string;
    '2: Indicator': string;
    '3: Last Refreshed': string;
    '4: Interval': string;
    '5: Time Period': number;
    '6: Series Type': string;
    '7: Time Zone': string;
  };
  'Technical Analysis: RSI'?: { [date: string]: { RSI: string } };
  'Technical Analysis: MACD'?: { [date: string]: { MACD: string; MACD_Hist: string; MACD_Signal: string } };
  'Technical Analysis: BBANDS'?: { [date: string]: { 'Real Upper Band': string; 'Real Middle Band': string; 'Real Lower Band': string } };
  'Technical Analysis: SMA'?: { [date: string]: { SMA: string } };
}

export class AlphaVantageService {
  private client: AxiosInstance;
  private baseUrl = 'https://www.alphavantage.co/query';
  private apiKey: string;
  private logger = loggers.alphavantage;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      params: {
        apikey: apiKey
      }
    });

    this.setupRequestInterceptor();
  }

  private setupRequestInterceptor(): void {
    this.client.interceptors.request.use(
      (config) => {
        this.logger.debug(`Alpha Vantage API call: ${config.params?.function} for ${config.params?.symbol}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => {
        if (response.data['Error Message']) {
          throw new Error(`Alpha Vantage API Error: ${response.data['Error Message']}`);
        }
        if (response.data['Note']) {
          this.logger.warn('Alpha Vantage rate limit hit:', response.data['Note']);
          throw new Error('Alpha Vantage rate limit exceeded');
        }
        return response;
      },
      (error) => {
        this.logger.error('Alpha Vantage API error:', {
          status: error.response?.status,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  async getStockPrice(symbol: string): Promise<{
    symbol: string;
    price: number;
    change: number;
    change_percent: number;
    volume: number;
    timestamp: string;
  }> {
    try {
      const response = await this.client.get('', {
        params: {
          function: 'TIME_SERIES_INTRADAY',
          symbol: symbol,
          interval: '60min',
          outputsize: 'compact'
        }
      });

      const timeSeries = response.data['Time Series (60min)'];
      if (!timeSeries) {
        throw new Error('No time series data available');
      }

      const dates = Object.keys(timeSeries).sort().reverse();
      const latestDate = dates[0];
      const previousDate = dates[1];

      const latest = timeSeries[latestDate];
      const previous = timeSeries[previousDate];

      const currentPrice = parseFloat(latest['4. close']);
      const previousPrice = parseFloat(previous['4. close']);
      const change = currentPrice - previousPrice;
      const changePercent = (change / previousPrice) * 100;

      return {
        symbol,
        price: currentPrice,
        change,
        change_percent: changePercent,
        volume: parseFloat(latest['5. volume']),
        timestamp: latestDate
      };
    } catch (error) {
      this.logger.error(`Failed to get stock price for ${symbol}:`, error);
      throw new Error('Alpha Vantage stock price error');
    }
  }

  async getTechnicalIndicators(symbol: string): Promise<TechnicalIndicators> {
    try {
      const [rsiData, macdData, bbData, sma20Data, sma50Data, sma200Data] = await Promise.all([
        this.getRSI(symbol),
        this.getMACD(symbol),
        this.getBollingerBands(symbol),
        this.getSMA(symbol, 20),
        this.getSMA(symbol, 50),
        this.getSMA(symbol, 200)
      ]);

      // Get volume SMA (approximate using price SMA as fallback)
      const volumeSMA = sma20Data || 0;

      return {
        rsi: rsiData || 50,
        macd: macdData || { value: 0, signal: 0, histogram: 0 },
        bollinger_bands: bbData || { upper: 0, middle: 0, lower: 0 },
        sma_20: sma20Data || 0,
        sma_50: sma50Data || 0,
        sma_200: sma200Data || 0,
        volume_sma: volumeSMA
      };
    } catch (error) {
      this.logger.error(`Failed to get technical indicators for ${symbol}:`, error);
      throw new Error('Alpha Vantage technical indicators error');
    }
  }

  private async getRSI(symbol: string, timePeriod = 14): Promise<number | null> {
    try {
      const response = await this.client.get<TechnicalIndicatorResponse>('', {
        params: {
          function: 'RSI',
          symbol: symbol,
          interval: 'daily',
          time_period: timePeriod,
          series_type: 'close'
        }
      });

      const rsiData = response.data['Technical Analysis: RSI'];
      if (!rsiData) return null;

      const dates = Object.keys(rsiData).sort().reverse();
      const latestRSI = rsiData[dates[0]];

      return latestRSI ? parseFloat(latestRSI.RSI) : null;
    } catch (error) {
      this.logger.error(`Failed to get RSI for ${symbol}:`, error);
      return null;
    }
  }

  private async getMACD(symbol: string): Promise<{ value: number; signal: number; histogram: number } | null> {
    try {
      const response = await this.client.get<TechnicalIndicatorResponse>('', {
        params: {
          function: 'MACD',
          symbol: symbol,
          interval: 'daily',
          series_type: 'close'
        }
      });

      const macdData = response.data['Technical Analysis: MACD'];
      if (!macdData) return null;

      const dates = Object.keys(macdData).sort().reverse();
      const latestMACD = macdData[dates[0]];

      if (!latestMACD) return null;

      return {
        value: parseFloat(latestMACD.MACD),
        signal: parseFloat(latestMACD.MACD_Signal),
        histogram: parseFloat(latestMACD.MACD_Hist)
      };
    } catch (error) {
      this.logger.error(`Failed to get MACD for ${symbol}:`, error);
      return null;
    }
  }

  private async getBollingerBands(symbol: string, timePeriod = 20): Promise<{ upper: number; middle: number; lower: number } | null> {
    try {
      const response = await this.client.get<TechnicalIndicatorResponse>('', {
        params: {
          function: 'BBANDS',
          symbol: symbol,
          interval: 'daily',
          time_period: timePeriod,
          series_type: 'close'
        }
      });

      const bbData = response.data['Technical Analysis: BBANDS'];
      if (!bbData) return null;

      const dates = Object.keys(bbData).sort().reverse();
      const latestBB = bbData[dates[0]];

      if (!latestBB) return null;

      return {
        upper: parseFloat(latestBB['Real Upper Band']),
        middle: parseFloat(latestBB['Real Middle Band']),
        lower: parseFloat(latestBB['Real Lower Band'])
      };
    } catch (error) {
      this.logger.error(`Failed to get Bollinger Bands for ${symbol}:`, error);
      return null;
    }
  }

  private async getSMA(symbol: string, timePeriod: number): Promise<number | null> {
    try {
      const response = await this.client.get<TechnicalIndicatorResponse>('', {
        params: {
          function: 'SMA',
          symbol: symbol,
          interval: 'daily',
          time_period: timePeriod,
          series_type: 'close'
        }
      });

      const smaData = response.data['Technical Analysis: SMA'];
      if (!smaData) return null;

      const dates = Object.keys(smaData).sort().reverse();
      const latestSMA = smaData[dates[0]];

      return latestSMA ? parseFloat(latestSMA.SMA) : null;
    } catch (error) {
      this.logger.error(`Failed to get SMA${timePeriod} for ${symbol}:`, error);
      return null;
    }
  }

  async getHistoricalData(symbol: string, outputSize: 'compact' | 'full' = 'compact'): Promise<Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>> {
    try {
      const response = await this.client.get<AlphaVantageResponse>('', {
        params: {
          function: 'TIME_SERIES_DAILY',
          symbol: symbol,
          outputsize: outputSize
        }
      });

      const timeSeries = response.data['Time Series (Daily)'];
      if (!timeSeries) {
        throw new Error('No historical data available');
      }

      return Object.entries(timeSeries)
        .map(([date, data]) => ({
          date,
          open: parseFloat(data['1. open']),
          high: parseFloat(data['2. high']),
          low: parseFloat(data['3. low']),
          close: parseFloat(data['4. close']),
          volume: parseFloat(data['5. volume'])
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch (error) {
      this.logger.error(`Failed to get historical data for ${symbol}:`, error);
      throw new Error('Alpha Vantage historical data error');
    }
  }

  async getCompanyOverview(symbol: string): Promise<{
    symbol: string;
    name: string;
    description: string;
    sector: string;
    industry: string;
    market_cap: number;
    pe_ratio: number;
    dividend_yield: number;
  } | null> {
    try {
      const response = await this.client.get('', {
        params: {
          function: 'OVERVIEW',
          symbol: symbol
        }
      });

      const data = response.data;
      if (!data.Symbol) return null;

      return {
        symbol: data.Symbol,
        name: data.Name || '',
        description: data.Description || '',
        sector: data.Sector || '',
        industry: data.Industry || '',
        market_cap: parseFloat(data.MarketCapitalization) || 0,
        pe_ratio: parseFloat(data.PERatio) || 0,
        dividend_yield: parseFloat(data.DividendYield) || 0
      };
    } catch (error) {
      this.logger.error(`Failed to get company overview for ${symbol}:`, error);
      return null;
    }
  }

  async getSupportResistanceLevels(symbol: string, days = 30): Promise<{
    support_levels: number[];
    resistance_levels: number[];
  }> {
    try {
      const historicalData = await this.getHistoricalData(symbol, 'compact');
      const recentData = historicalData.slice(0, days);

      if (recentData.length === 0) {
        return { support_levels: [], resistance_levels: [] };
      }

      // Calculate support and resistance levels
      const prices = recentData.map(d => [d.high, d.low, d.close]).flat();
      const sortedPrices = prices.sort((a, b) => a - b);

      // Find significant levels (simplified approach)
      const supportLevels: number[] = [];
      const resistanceLevels: number[] = [];

      // Get recent low and high points
      const recentLows = recentData.map(d => d.low).sort((a, b) => a - b);
      const recentHighs = recentData.map(d => d.high).sort((a, b) => b - a);

      // Support levels (recent lows)
      supportLevels.push(
        recentLows[0], // Lowest low
        recentLows[Math.floor(recentLows.length * 0.25)], // 25th percentile
        recentLows[Math.floor(recentLows.length * 0.5)] // Median low
      );

      // Resistance levels (recent highs)
      resistanceLevels.push(
        recentHighs[0], // Highest high
        recentHighs[Math.floor(recentHighs.length * 0.25)], // 75th percentile
        recentHighs[Math.floor(recentHighs.length * 0.5)] // Median high
      );

      return {
        support_levels: [...new Set(supportLevels)].filter(level => level > 0).sort((a, b) => b - a),
        resistance_levels: [...new Set(resistanceLevels)].filter(level => level > 0).sort((a, b) => a - b)
      };
    } catch (error) {
      this.logger.error(`Failed to calculate support/resistance for ${symbol}:`, error);
      return { support_levels: [], resistance_levels: [] };
    }
  }

  async getVolatility(symbol: string, days = 20): Promise<number> {
    try {
      const historicalData = await this.getHistoricalData(symbol, 'compact');
      const recentData = historicalData.slice(0, days);

      if (recentData.length < 2) return 0;

      // Calculate daily returns
      const returns = [];
      for (let i = 1; i < recentData.length; i++) {
        const currentPrice = recentData[i - 1].close;
        const previousPrice = recentData[i].close;
        const dailyReturn = (currentPrice - previousPrice) / previousPrice;
        returns.push(dailyReturn);
      }

      // Calculate standard deviation (volatility)
      const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
      const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
      const volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualized volatility

      return volatility * 100; // Return as percentage
    } catch (error) {
      this.logger.error(`Failed to calculate volatility for ${symbol}:`, error);
      return 0;
    }
  }
}