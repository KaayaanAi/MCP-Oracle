// Third-party packages
import axios, { AxiosInstance } from 'axios';

// Local imports
import { loggers } from '../utils/logger.js';

export interface CoinGeckoPrice {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  fully_diluted_valuation: number | null;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  market_cap_change_24h: number;
  market_cap_change_percentage_24h: number;
  circulating_supply: number;
  total_supply: number | null;
  max_supply: number | null;
  ath: number;
  ath_change_percentage: number;
  ath_date: string;
  atl: number;
  atl_change_percentage: number;
  atl_date: string;
  last_updated: string;
}

export interface CoinGeckoHistoricalData {
  prices: [number, number][];
  market_caps: [number, number][];
  total_volumes: [number, number][];
}

export interface MarketData {
  symbol: string;
  price: number;
  change_24h: number;
  change_percentage_24h: number;
  volume_24h: number;
  market_cap: number;
  high_24h: number;
  low_24h: number;
  ath: number;
  atl: number;
  last_updated: string;
}

export class CoinGeckoService {
  private client: AxiosInstance;
  private baseUrl = 'https://api.coingecko.com/api/v3';
  private logger = loggers.coingecko;
  private rateLimitCounter = 0;
  private lastResetTime = Date.now();
  private circuitBreakerFailures = 0;
  private circuitBreakerLastFailTime = 0;
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute
  private readonly RATE_LIMIT_PER_MINUTE = 100; // Conservative estimate

  constructor(apiKey: string) {
    const headers: any = {
      'Accept': 'application/json'
    };

    // Only add API key header if provided (for Pro tier)
    if (apiKey && apiKey.trim()) {
      headers['x-cg-demo-api-key'] = apiKey;
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        this.logger.debug(`🦄 CoinGecko API call: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => {
        this.logger.debug(`✅ CoinGecko response: ${response.status}`);
        return response;
      },
      (error) => {
        this.logger.error('❌ CoinGecko API error:', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message
        });
        if (error.response?.status === 429) {
          this.logger.warn('🔄 CoinGecko rate limit hit - retrying with delay');
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Check circuit breaker state
   */
  private isCircuitBreakerOpen(): boolean {
    if (this.circuitBreakerFailures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      const timeSinceLastFailure = Date.now() - this.circuitBreakerLastFailTime;
      if (timeSinceLastFailure < this.CIRCUIT_BREAKER_TIMEOUT) {
        return true;
      } else {
        // Reset circuit breaker after timeout
        this.circuitBreakerFailures = 0;
        this.logger.info('🔄 Circuit breaker reset - attempting reconnection');
      }
    }
    return false;
  }

  /**
   * Check and enforce rate limits
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const minutesSinceReset = (now - this.lastResetTime) / 60000;

    if (minutesSinceReset >= 1) {
      // Reset counter every minute
      this.rateLimitCounter = 0;
      this.lastResetTime = now;
    }

    if (this.rateLimitCounter >= this.RATE_LIMIT_PER_MINUTE) {
      const waitTime = 60000 - (now - this.lastResetTime);
      this.logger.warn(`⏱️ Rate limit reached, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.rateLimitCounter = 0;
      this.lastResetTime = Date.now();
    }

    this.rateLimitCounter++;
  }

  /**
   * Record circuit breaker failure
   */
  private recordFailure(): void {
    this.circuitBreakerFailures++;
    this.circuitBreakerLastFailTime = Date.now();
    this.logger.warn(`🔴 Circuit breaker failure recorded (${this.circuitBreakerFailures}/${this.CIRCUIT_BREAKER_THRESHOLD})`);
  }

  /**
   * Reset circuit breaker on successful request
   */
  private recordSuccess(): void {
    if (this.circuitBreakerFailures > 0) {
      this.logger.info('🟢 Circuit breaker reset - successful request');
      this.circuitBreakerFailures = 0;
    }
  }

  /**
   * Get current prices for cryptocurrencies
   */
  async getCurrentPrices(symbols: string[]): Promise<MarketData[]> {
    // Check circuit breaker
    if (this.isCircuitBreakerOpen()) {
      const error = new Error('CoinGecko service circuit breaker is open - too many recent failures');
      this.logger.error('🔴 Circuit breaker open, rejecting request');
      throw error;
    }

    try {
      // Enforce rate limiting
      await this.checkRateLimit();

      const coinIds = this.symbolsToCoinIds(symbols);
      this.logger.info(`🔍 Fetching REAL prices for: ${symbols.join(', ')} (${coinIds.join(', ')})`);

      const response = await this.client.get<CoinGeckoPrice[]>('/coins/markets', {
        params: {
          vs_currency: 'usd',
          ids: coinIds.join(','),
          order: 'market_cap_desc',
          per_page: 100,
          page: 1,
          sparkline: false,
          price_change_percentage: '24h'
        },
        timeout: 15000 // Explicit timeout
      });

      // Record successful request
      this.recordSuccess();

      const marketData = response.data.map(coin => ({
        symbol: coin.symbol.toUpperCase(),
        price: coin.current_price,
        change_24h: coin.price_change_24h,
        change_percentage_24h: coin.price_change_percentage_24h,
        volume_24h: coin.total_volume,
        market_cap: coin.market_cap,
        high_24h: coin.high_24h,
        low_24h: coin.low_24h,
        ath: coin.ath,
        atl: coin.atl,
        last_updated: coin.last_updated
      }));

      this.logger.info(`✅ Retrieved REAL prices: BTC=$${marketData.find(d => d.symbol === 'BTC')?.price?.toLocaleString()}, ETH=$${marketData.find(d => d.symbol === 'ETH')?.price?.toLocaleString()}`);

      return marketData;
    } catch (error) {
      // Record failure for circuit breaker
      this.recordFailure();

      this.logger.error('❌ Failed to fetch real current prices:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        circuitBreakerFailures: this.circuitBreakerFailures
      });
      throw new Error(`CoinGecko current prices API failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get detailed market data with all metrics
   */
  async getDetailedMarketData(symbols: string[]): Promise<MarketData[]> {
    return this.getCurrentPrices(symbols);
  }

  /**
   * Get historical price data
   */
  async getPriceHistory(symbol: string, days: number = 30): Promise<any[]> {
    try {
      const coinId = this.symbolToCoinId(symbol);
      this.logger.info(`📊 Fetching ${days}-day price history for ${symbol} (${coinId})`);

      const response = await this.client.get<CoinGeckoHistoricalData>(`/coins/${coinId}/market_chart`, {
        params: {
          vs_currency: 'usd',
          days: days
          // Removed interval parameter due to CoinGecko API plan limitations
          // interval: days > 90 ? 'daily' : 'hourly'
        }
      });

      const historicalData = response.data.prices.map(([timestamp, price]) => ({
        timestamp,
        price,
        date: new Date(timestamp).toISOString(),
        close: price
      }));

      this.logger.info(`✅ Retrieved ${historicalData.length} historical data points for ${symbol}`);
      return historicalData;
    } catch (error) {
      this.logger.error(`❌ Failed to fetch price history for ${symbol}:`, error);
      throw new Error(`CoinGecko price history API failed for ${symbol}`);
    }
  }

  /**
   * Get single asset current price
   */
  async getSinglePrice(symbol: string): Promise<number> {
    try {
      const coinId = this.symbolToCoinId(symbol);
      this.logger.info(`💰 Fetching REAL current price for ${symbol}`);

      const response = await this.client.get(`/simple/price`, {
        params: {
          ids: coinId,
          vs_currencies: 'usd'
        }
      });

      const price = response.data[coinId]?.usd;
      if (!price || typeof price !== 'number') {
        throw new Error(`No price data found for ${symbol} (coinId: ${coinId})`);
      }

      this.logger.info(`✅ REAL price for ${symbol}: $${price.toLocaleString()}`);
      return price;
    } catch (error) {
      this.logger.error(`❌ Failed to fetch single price for ${symbol}:`, error);
      throw new Error(`CoinGecko single price API failed for ${symbol}`);
    }
  }

  /**
   * Get trending cryptocurrencies
   */
  async getTrending(): Promise<any[]> {
    try {
      this.logger.info('📈 Fetching trending cryptocurrencies');

      const response = await this.client.get('/search/trending');
      const trending = response.data.coins.map((coin: any) => ({
        id: coin.item.id,
        name: coin.item.name,
        symbol: coin.item.symbol.toUpperCase(),
        rank: coin.item.market_cap_rank,
        price_btc: coin.item.price_btc
      }));

      this.logger.info(`✅ Retrieved ${trending.length} trending coins`);
      return trending;
    } catch (error) {
      this.logger.error('❌ Failed to fetch trending data:', error);
      throw new Error('CoinGecko trending API failed');
    }
  }

  /**
   * Get global market data
   */
  async getGlobalMarketData(): Promise<any> {
    try {
      this.logger.info('🌍 Fetching global market data');

      const response = await this.client.get('/global');
      const globalData = {
        total_market_cap_usd: response.data.data.total_market_cap.usd,
        total_volume_usd: response.data.data.total_volume.usd,
        market_cap_percentage: response.data.data.market_cap_percentage,
        active_cryptocurrencies: response.data.data.active_cryptocurrencies,
        markets: response.data.data.markets,
        market_cap_change_percentage_24h: response.data.data.market_cap_change_percentage_24h_usd
      };

      this.logger.info(`✅ Global market cap: $${globalData.total_market_cap_usd.toLocaleString()}`);
      return globalData;
    } catch (error) {
      this.logger.error('❌ Failed to fetch global market data:', error);
      throw new Error('CoinGecko global market API failed');
    }
  }

  /**
   * Convert symbols to CoinGecko coin IDs
   */
  private symbolsToCoinIds(symbols: string[]): string[] {
    return symbols.map(symbol => this.symbolToCoinId(symbol));
  }

  /**
   * Convert symbol to CoinGecko coin ID with support for trading pairs
   */
  private symbolToCoinId(symbol: string): string {
    const symbolMap: Record<string, string> = {
      // Standard cryptocurrency symbols
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'BNB': 'binancecoin',
      'XRP': 'ripple',
      'SOL': 'solana',
      'ADA': 'cardano',
      'DOGE': 'dogecoin',
      'AVAX': 'avalanche-2',
      'TRX': 'tron',
      'DOT': 'polkadot',
      'MATIC': 'matic-network',
      'LINK': 'chainlink',
      'UNI': 'uniswap',
      'LTC': 'litecoin',
      'BCH': 'bitcoin-cash',
      'NEAR': 'near',
      'ICP': 'internet-computer',
      'APT': 'aptos',
      'STX': 'stacks',
      'FIL': 'filecoin',

      // Trading pairs (USDT, BUSD, etc.) - extract base currency
      'BTCUSDT': 'bitcoin',
      'ETHUSDT': 'ethereum',
      'BNBUSDT': 'binancecoin',
      'XRPUSDT': 'ripple',
      'SOLUSDT': 'solana',
      'ADAUSDT': 'cardano',
      'DOGEUSDT': 'dogecoin',
      'AVAXUSDT': 'avalanche-2',
      'TRXUSDT': 'tron',
      'DOTUSDT': 'polkadot',
      'MATICUSDT': 'matic-network',
      'LINKUSDT': 'chainlink',
      'UNIUSDT': 'uniswap',
      'LTCUSDT': 'litecoin',
      'BCHUSDT': 'bitcoin-cash',
      'NEARUSDT': 'near',
      'ICPUSDT': 'internet-computer',
      'APTUSDT': 'aptos',
      'STXUSDT': 'stacks',
      'FILUSDT': 'filecoin',

      // BUSD pairs
      'BTCBUSD': 'bitcoin',
      'ETHBUSD': 'ethereum',
      'BNBBUSD': 'binancecoin',
      'SOLBUSD': 'solana',

      // Alternative naming
      'BITCOIN': 'bitcoin',
      'ETHEREUM': 'ethereum',
      'SOLANA': 'solana',
      'CARDANO': 'cardano'
    };

    const upperSymbol = symbol.toUpperCase();

    // Direct mapping first
    if (symbolMap[upperSymbol]) {
      return symbolMap[upperSymbol];
    }

    // Try to extract base currency from trading pairs
    if (upperSymbol.endsWith('USDT')) {
      const baseCurrency = upperSymbol.replace('USDT', '');
      if (symbolMap[baseCurrency]) {
        return symbolMap[baseCurrency];
      }
    }

    if (upperSymbol.endsWith('BUSD')) {
      const baseCurrency = upperSymbol.replace('BUSD', '');
      if (symbolMap[baseCurrency]) {
        return symbolMap[baseCurrency];
      }
    }

    if (upperSymbol.endsWith('USD')) {
      const baseCurrency = upperSymbol.replace('USD', '');
      if (symbolMap[baseCurrency]) {
        return symbolMap[baseCurrency];
      }
    }

    // Fallback to lowercase
    return symbol.toLowerCase();
  }

  /**
   * Health check for CoinGecko API
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/ping');
      this.logger.info('✅ CoinGecko API health check passed');
      return true;
    } catch (error) {
      this.logger.error('❌ CoinGecko API health check failed:', error);
      return false;
    }
  }
}