import axios, { AxiosInstance } from 'axios';
import type { MarketData } from '../types/index.js';
import { loggers } from '../utils/logger.js';

export interface CoinGeckoPrice {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  fully_diluted_valuation: number;
  total_volume: number;
  high_24h: number;
  low_24h: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  market_cap_change_24h: number;
  market_cap_change_percentage_24h: number;
  circulating_supply: number;
  total_supply: number;
  max_supply: number;
  ath: number;
  ath_change_percentage: number;
  ath_date: string;
  atl: number;
  atl_change_percentage: number;
  atl_date: string;
  last_updated: string;
}

export interface CoinGeckoPriceHistory {
  prices: Array<[number, number]>;
  market_caps: Array<[number, number]>;
  total_volumes: Array<[number, number]>;
}

export class CoinGeckoService {
  private client: AxiosInstance;
  private baseUrl = 'https://api.coingecko.com/api/v3';
  private apiKey?: string;
  private logger = loggers.coingecko;

  // Centralized symbol to CoinGecko ID mapping
  private static readonly symbolMap: Record<string, string> = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'USDT': 'tether',
    'BNB': 'binancecoin',
    'SOL': 'solana',
    'USDC': 'usd-coin',
    'XRP': 'ripple',
    'DOGE': 'dogecoin',
    'TON': 'the-open-network',
    'ADA': 'cardano',
    'SHIB': 'shiba-inu',
    'AVAX': 'avalanche-2',
    'TRX': 'tron',
    'DOT': 'polkadot',
    'LINK': 'chainlink',
    'MATIC': 'matic-network',
    'ICP': 'internet-computer',
    'LTC': 'litecoin',
    'UNI': 'uniswap',
    'ATOM': 'cosmos'
  };

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        ...(apiKey && { 'x-cg-demo-api-key': apiKey })
      }
    });

    this.setupRequestInterceptor();
  }

  private setupRequestInterceptor(): void {
    this.client.interceptors.request.use(
      (config) => {
        this.logger.debug(`CoinGecko API call: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logger.error('CoinGecko API error:', {
          status: error.response?.status,
          data: error.response?.data
        });
        if (error.response?.status === 429) {
          this.logger.warn('CoinGecko rate limit hit, consider upgrading API plan');
        }
        return Promise.reject(error);
      }
    );
  }

  async getCurrentPrices(symbols: string[]): Promise<MarketData[]> {
    try {
      // Convert symbols to CoinGecko IDs (BTC -> bitcoin, ETH -> ethereum)
      const coinIds = this.symbolsToCoinIds(symbols);

      const response = await this.client.get<CoinGeckoPrice[]>('/coins/markets', {
        params: {
          vs_currency: 'usd',
          ids: coinIds.join(','),
          order: 'market_cap_desc',
          per_page: symbols.length,
          page: 1,
          sparkline: false,
          price_change_percentage: '24h'
        }
      });

      return response.data.map(coin => ({
        symbol: coin.symbol.toUpperCase(),
        price: coin.current_price,
        change_24h: coin.price_change_percentage_24h,
        volume: coin.total_volume,
        market_cap: coin.market_cap,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      this.logger.error('Failed to fetch current prices from CoinGecko:', error);
      throw new Error('CoinGecko API error');
    }
  }

  async getPriceHistory(symbol: string, days = 1): Promise<Array<{ timestamp: string; price: number; volume: number }>> {
    try {
      const coinId = this.symbolToCoinId(symbol);

      const response = await this.client.get<CoinGeckoPriceHistory>(`/coins/${coinId}/market_chart`, {
        params: {
          vs_currency: 'usd',
          days: days,
          interval: days <= 1 ? 'hourly' : 'daily'
        }
      });

      const { prices, total_volumes } = response.data;

      return prices.map((price, index) => ({
        timestamp: new Date(price[0]).toISOString(),
        price: price[1],
        volume: total_volumes[index]?.[1] || 0
      }));
    } catch (error) {
      this.logger.error(`Failed to fetch price history for ${symbol}:`, error);
      throw new Error('CoinGecko price history error');
    }
  }

  async getTrendingCoins(): Promise<Array<{ id: string; symbol: string; name: string; market_cap_rank: number }>> {
    try {
      const response = await this.client.get('/search/trending');

      return response.data.coins.slice(0, 10).map((coin: any) => ({
        id: coin.item.id,
        symbol: coin.item.symbol.toUpperCase(),
        name: coin.item.name,
        market_cap_rank: coin.item.market_cap_rank
      }));
    } catch (error) {
      this.logger.error('Failed to fetch trending coins:', error);
      return [];
    }
  }

  async getMarketGlobalData(): Promise<{
    total_market_cap: number;
    total_volume: number;
    market_cap_percentage: Record<string, number>;
    market_cap_change_percentage_24h: number;
  }> {
    try {
      const response = await this.client.get('/global');
      const data = response.data.data;

      return {
        total_market_cap: data.total_market_cap.usd,
        total_volume: data.total_volume.usd,
        market_cap_percentage: data.market_cap_percentage,
        market_cap_change_percentage_24h: data.market_cap_change_percentage_24h_usd
      };
    } catch (error) {
      this.logger.error('Failed to fetch global market data:', error);
      throw new Error('CoinGecko global data error');
    }
  }

  private symbolsToCoinIds(symbols: string[]): string[] {
    return symbols.map(symbol => this.normalizeAndMapSymbol(symbol));
  }

  private symbolToCoinId(symbol: string): string {
    return this.normalizeAndMapSymbol(symbol);
  }

  // Consolidated method to handle symbol normalization and mapping
  private normalizeAndMapSymbol(symbol: string): string {
    const normalizedSymbol = symbol.replace('USDT', '').replace('USD', '');
    return CoinGeckoService.symbolMap[normalizedSymbol] || normalizedSymbol.toLowerCase();
  }

  async getDetailedMarketData(symbols: string[]): Promise<Array<{
    symbol: string;
    price: number;
    change_24h: number;
    volume: number;
    market_cap: number;
    high_24h: number;
    low_24h: number;
    ath: number;
    ath_change_percentage: number;
    market_cap_rank: number;
    timestamp: string;
  }>> {
    try {
      const coinIds = this.symbolsToCoinIds(symbols);

      const response = await this.client.get<CoinGeckoPrice[]>('/coins/markets', {
        params: {
          vs_currency: 'usd',
          ids: coinIds.join(','),
          order: 'market_cap_desc',
          per_page: symbols.length,
          page: 1,
          sparkline: false,
          price_change_percentage: '24h'
        }
      });

      return response.data.map(coin => ({
        symbol: coin.symbol.toUpperCase(),
        price: coin.current_price,
        change_24h: coin.price_change_percentage_24h,
        volume: coin.total_volume,
        market_cap: coin.market_cap,
        high_24h: coin.high_24h,
        low_24h: coin.low_24h,
        ath: coin.ath,
        ath_change_percentage: coin.ath_change_percentage,
        market_cap_rank: coin.market_cap_rank,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      this.logger.error('Failed to fetch detailed market data from CoinGecko:', error);
      throw new Error('CoinGecko detailed market data error');
    }
  }
}