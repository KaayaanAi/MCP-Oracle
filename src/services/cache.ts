// Third-party packages
import { createClient, RedisClientType } from 'redis';

// Local imports
import type {
  CacheEntry,
  Cacheable,
  AssetSymbol,
  Timestamp,
  Result,
  APIError
} from '../types/index.js';
import {
  createSuccess,
  createError,
  createTimestamp
} from '../types/index.js';
import { loggers } from '../utils/logger.js';

// Specific cache data types
export interface MarketDataCacheEntry extends Cacheable {
  readonly symbol: AssetSymbol;
  readonly price: number;
  readonly change_24h: number;
  readonly volume: number;
  readonly market_cap?: number;
}

export interface NewsDataCacheEntry extends Cacheable {
  readonly title: string;
  readonly content: string;
  readonly source: string;
  readonly sentiment_score: number;
  readonly symbols: readonly AssetSymbol[];
}

export interface TechnicalDataCacheEntry extends Cacheable {
  readonly symbol: AssetSymbol;
  readonly indicators: Record<string, number | string | boolean>;
  readonly signals: Record<string, unknown>;
}

export interface CacheStats {
  readonly connected: boolean;
  readonly memory_usage?: string;
  readonly total_keys?: number;
  readonly hit_rate?: string;
  readonly uptime?: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetTime: number;
  readonly windowSeconds: number;
}

export class CacheService {
  private client?: RedisClientType;
  private defaultTTL: number;
  private isConnected = false;
  private logger = loggers.cache;

  constructor(redisUrl: string, defaultTTL = 300) {
    this.defaultTTL = defaultTTL;
    this.initializeClient(redisUrl);
  }

  private async initializeClient(redisUrl: string): Promise<void> {
    try {
      // Parse Redis URL and handle Docker container networking
      const parsedUrl = new URL(redisUrl);

      // Fix IPv6 localhost issue for Docker
      if (parsedUrl.hostname === '::1' || parsedUrl.hostname === 'localhost') {
        parsedUrl.hostname = 'redis';
        this.logger.info(`🔧 Fixed Redis hostname for Docker: ${parsedUrl.toString()}`);
      }

      this.client = createClient({
        url: parsedUrl.toString(),
        socket: {
          reconnectStrategy: (retries) => {
            const delay = Math.min(retries * 50, 500);
            this.logger.debug(`Redis reconnect attempt ${retries}, delay: ${delay}ms`);
            return delay;
          },
          connectTimeout: 10000
        },
        // Handle authentication if present in URL
        password: parsedUrl.password || undefined
      });

      this.client.on('error', (err) => {
        this.logger.error('❌ Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        this.logger.info('✅ Redis Client Connected to', parsedUrl.hostname);
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        this.logger.info('🚀 Redis Client Ready');
        this.isConnected = true;
      });

      this.client.on('end', () => {
        this.logger.info('🔌 Redis Client Disconnected');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        this.logger.info('🔄 Redis Client Reconnecting...');
      });

      await this.client.connect();
      this.logger.info(`✅ Redis cache service initialized successfully`);
    } catch (error) {
      this.logger.warn('⚠️ Redis connection failed, operating without cache:', error);
      this.isConnected = false;
      // Don't throw error - allow service to work without cache
    }
  }

  async get<T extends Cacheable = Cacheable>(key: string): Promise<Result<T, APIError>> {
    if (!this.isConnected || !this.client) {
      const error: APIError = {
        type: 'api_error',
        code: 'CACHE_NOT_CONNECTED',
        message: 'Cache service not connected',
        timestamp: createTimestamp(new Date().toISOString()),
        service: 'cache',
        retryable: false
      };
      return createError(error);
    }

    try {
      const cached = await this.client.get(key);
      if (!cached) {
        const error: APIError = {
          type: 'api_error',
          code: 'CACHE_MISS',
          message: `No cached data found for key: ${key}`,
          timestamp: createTimestamp(new Date().toISOString()),
          service: 'cache',
          retryable: false
        };
        return createError(error);
      }

      const entry: CacheEntry<T> = JSON.parse(cached);

      // Check if entry has expired
      if (Date.now() > entry.timestamp + entry.ttl * 1000) {
        await this.delete(key);
        const error: APIError = {
          type: 'api_error',
          code: 'CACHE_EXPIRED',
          message: `Cached data expired for key: ${key}`,
          timestamp: createTimestamp(new Date().toISOString()),
          service: 'cache',
          retryable: false
        };
        return createError(error);
      }

      this.logger.debug(`Cache hit: ${key}`);
      return createSuccess(entry.data);
    } catch (error) {
      this.logger.warn(`Cache get error for key "${key}":`, error);
      const apiError: APIError = {
        type: 'api_error',
        code: 'CACHE_READ_ERROR',
        message: error instanceof Error ? error.message : 'Unknown cache error',
        timestamp: createTimestamp(new Date().toISOString()),
        service: 'cache',
        retryable: true
      };
      return createError(apiError);
    }
  }

  async set<T extends Cacheable = Cacheable>(key: string, data: T, ttl?: number): Promise<Result<boolean, APIError>> {
    if (!this.isConnected || !this.client) {
      const error: APIError = {
        type: 'api_error',
        code: 'CACHE_NOT_CONNECTED',
        message: 'Cache service not connected',
        timestamp: createTimestamp(new Date().toISOString()),
        service: 'cache',
        retryable: false
      };
      return createError(error);
    }

    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl: ttl || this.defaultTTL,
        key
      };

      await this.client.setEx(key, ttl || this.defaultTTL, JSON.stringify(entry));
      this.logger.debug(`Cache set: ${key} (TTL: ${ttl || this.defaultTTL}s)`);
      return createSuccess(true);
    } catch (error) {
      this.logger.warn(`Cache set error for key "${key}":`, error);
      const apiError: APIError = {
        type: 'api_error',
        code: 'CACHE_WRITE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown cache error',
        timestamp: createTimestamp(new Date().toISOString()),
        service: 'cache',
        retryable: true
      };
      return createError(apiError);
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      await this.client.del(key);
      this.logger.debug(`Cache deleted: ${key}`);
      return true;
    } catch (error) {
      this.logger.warn(`Cache delete error for key "${key}":`, error);
      return false;
    }
  }

  async clear(): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      await this.client.flushAll();
      this.logger.info('Cache cleared');
      return true;
    } catch (error) {
      this.logger.warn('Cache clear error:', error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error) {
      this.logger.warn(`Cache exists error for key "${key}":`, error);
      return false;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.isConnected || !this.client) {
      return [];
    }

    try {
      return await this.client.keys(pattern);
    } catch (error) {
      this.logger.warn(`Cache keys error for pattern "${pattern}":`, error);
      return [];
    }
  }

  async getStats(): Promise<CacheStats> {
    if (!this.isConnected || !this.client) {
      return { connected: false };
    }

    try {
      const info = await this.client.info('memory');
      const keyCount = await this.client.dbSize();

      // Parse memory usage from info string
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      const memoryUsage = memoryMatch ? memoryMatch[1].trim() : 'Unknown';

      return {
        connected: true,
        memory_usage: memoryUsage,
        total_keys: keyCount,
        hit_rate: 'N/A' // Would need hit/miss tracking for accurate calculation
      };
    } catch (error) {
      this.logger.warn('Cache stats error:', error);
      return { connected: this.isConnected };
    }
  }

  // Market-specific cache methods with strong typing
  async getCachedMarketData(symbols: readonly AssetSymbol[]): Promise<Result<MarketDataCacheEntry[], APIError>> {
    const key = `market_data:${[...symbols].sort().join(',')}`;
    return await this.get<MarketDataCacheEntry[]>(key);
  }

  async setCachedMarketData(
    symbols: readonly AssetSymbol[],
    data: MarketDataCacheEntry[],
    ttl = 300
  ): Promise<Result<boolean, APIError>> {
    const key = `market_data:${[...symbols].sort().join(',')}`;
    // Add timestamp to make it Cacheable
    const cacheableData = data.map(item => ({
      ...item,
      timestamp: item.timestamp || createTimestamp(new Date().toISOString())
    })) as MarketDataCacheEntry[] & Cacheable;
    return await this.set(key, cacheableData, ttl);
  }

  async getCachedNews(symbols: string[], hours: number): Promise<Result<any[], APIError>> {
    const key = `news:${symbols.sort().join(',')}:${hours}h`;
    return await this.get<any[]>(key);
  }

  async setCachedNews(symbols: string[], hours: number, data: any[], ttl = 1800): Promise<Result<boolean, APIError>> {
    const key = `news:${symbols.sort().join(',')}:${hours}h`;
    const cacheableData = { data, timestamp: createTimestamp(new Date().toISOString()) };
    return await this.set(key, cacheableData, ttl);
  }

  async getCachedSentiment(symbols: string[]): Promise<Result<any[], APIError>> {
    const key = `sentiment:${symbols.sort().join(',')}`;
    return await this.get<any[]>(key);
  }

  async setCachedSentiment(symbols: string[], data: any[], ttl = 900): Promise<Result<boolean, APIError>> {
    const key = `sentiment:${symbols.sort().join(',')}`;
    const cacheableData = { data, timestamp: createTimestamp(new Date().toISOString()) };
    return await this.set(key, cacheableData, ttl);
  }

  async getCachedTechnicalData(symbol: string): Promise<Result<any, APIError>> {
    const key = `technical:${symbol}`;
    return await this.get<any>(key);
  }

  async setCachedTechnicalData(symbol: string, data: any, ttl = 600): Promise<Result<boolean, APIError>> {
    const key = `technical:${symbol}`;
    const cacheableData = { data, timestamp: createTimestamp(new Date().toISOString()) };
    return await this.set(key, cacheableData, ttl);
  }

  async getCachedPrice(symbol: string): Promise<Result<number, APIError>> {
    const key = `price:${symbol}`;
    return await this.get<number>(key);
  }

  async setCachedPrice(symbol: string, price: number, ttl = 60): Promise<Result<boolean, APIError>> {
    const key = `price:${symbol}`;
    const cacheableData = { price, timestamp: createTimestamp(new Date().toISOString()) };
    return await this.set(key, cacheableData, ttl);
  }

  async getCachedForecast(symbol: string, days: number): Promise<Result<any, APIError>> {
    const key = `forecast:${symbol}:${days}d`;
    return await this.get<any>(key);
  }

  async setCachedForecast(symbol: string, days: number, data: any, ttl = 3600): Promise<Result<boolean, APIError>> {
    const key = `forecast:${symbol}:${days}d`;
    const cacheableData = { data, timestamp: createTimestamp(new Date().toISOString()) };
    return await this.set(key, cacheableData, ttl);
  }

  // Utility methods
  generateKey(prefix: string, ...parts: (string | number)[]): string {
    return `${prefix}:${parts.join(':')}`;
  }

  async incrementCounter(key: string, ttl?: number): Promise<number> {
    if (!this.isConnected || !this.client) {
      return 0;
    }

    try {
      const count = await this.client.incr(key);
      if (ttl && count === 1) {
        await this.client.expire(key, ttl);
      }
      return count;
    } catch (error) {
      this.logger.warn(`Cache increment error for key "${key}":`, error);
      return 0;
    }
  }

  async rateLimitCheck(
    identifier: string,
    limit: number,
    windowSeconds: number
  ): Promise<RateLimitResult> {
    const key = `ratelimit:${identifier}`;
    const current = await this.incrementCounter(key, windowSeconds);

    return {
      allowed: current <= limit,
      remaining: Math.max(0, limit - current),
      resetTime: Date.now() + (windowSeconds * 1000),
      windowSeconds
    };
  }

  async close(): Promise<void> {
    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
        this.logger.info('Redis connection closed');
      } catch (error) {
        this.logger.warn('Error closing Redis connection:', error);
      }
    }
  }

  isReady(): boolean {
    return this.isConnected;
  }
}