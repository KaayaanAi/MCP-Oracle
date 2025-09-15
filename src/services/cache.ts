import { createClient, RedisClientType } from 'redis';
import type { CacheEntry } from '../types/index.js';
import { loggers } from '../utils/logger.js';

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
      this.client = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => Math.min(retries * 50, 500)
        }
      });

      this.client.on('error', (err) => {
        this.logger.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        this.logger.info('Redis Client Connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        this.logger.info('Redis Client Ready');
        this.isConnected = true;
      });

      this.client.on('end', () => {
        this.logger.info('Redis Client Disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
    } catch (error) {
      this.logger.warn('Redis connection failed, operating without cache:', error);
      this.isConnected = false;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected || !this.client) {
      return null;
    }

    try {
      const cached = await this.client.get(key);
      if (!cached) return null;

      const entry: CacheEntry<T> = JSON.parse(cached);

      // Check if entry has expired
      if (Date.now() > entry.timestamp + entry.ttl * 1000) {
        await this.delete(key);
        return null;
      }

      this.logger.debug(`Cache hit: ${key}`);
      return entry.data;
    } catch (error) {
      this.logger.warn(`Cache get error for key "${key}":`, error);
      return null;
    }
  }

  async set<T>(key: string, data: T, ttl?: number): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl: ttl || this.defaultTTL
      };

      await this.client.setEx(key, ttl || this.defaultTTL, JSON.stringify(entry));
      this.logger.debug(`Cache set: ${key} (TTL: ${ttl || this.defaultTTL}s)`);
      return true;
    } catch (error) {
      this.logger.warn(`Cache set error for key "${key}":`, error);
      return false;
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

  async getStats(): Promise<{
    connected: boolean;
    memory_usage?: string;
    total_keys?: number;
    hit_rate?: string;
  }> {
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

  // Market-specific cache methods
  async getCachedMarketData(symbols: string[]): Promise<any[] | null> {
    const key = `market_data:${symbols.sort().join(',')}`;
    return await this.get<any[]>(key);
  }

  async setCachedMarketData(symbols: string[], data: any[], ttl = 300): Promise<boolean> {
    const key = `market_data:${symbols.sort().join(',')}`;
    return await this.set(key, data, ttl);
  }

  async getCachedNews(symbols: string[], hours: number): Promise<any[] | null> {
    const key = `news:${symbols.sort().join(',')}:${hours}h`;
    return await this.get<any[]>(key);
  }

  async setCachedNews(symbols: string[], hours: number, data: any[], ttl = 1800): Promise<boolean> {
    const key = `news:${symbols.sort().join(',')}:${hours}h`;
    return await this.set(key, data, ttl);
  }

  async getCachedSentiment(symbols: string[]): Promise<any[] | null> {
    const key = `sentiment:${symbols.sort().join(',')}`;
    return await this.get<any[]>(key);
  }

  async setCachedSentiment(symbols: string[], data: any[], ttl = 900): Promise<boolean> {
    const key = `sentiment:${symbols.sort().join(',')}`;
    return await this.set(key, data, ttl);
  }

  async getCachedTechnicalData(symbol: string): Promise<any | null> {
    const key = `technical:${symbol}`;
    return await this.get<any>(key);
  }

  async setCachedTechnicalData(symbol: string, data: any, ttl = 600): Promise<boolean> {
    const key = `technical:${symbol}`;
    return await this.set(key, data, ttl);
  }

  async getCachedPrice(symbol: string): Promise<number | null> {
    const key = `price:${symbol}`;
    return await this.get<number>(key);
  }

  async setCachedPrice(symbol: string, price: number, ttl = 60): Promise<boolean> {
    const key = `price:${symbol}`;
    return await this.set(key, price, ttl);
  }

  async getCachedForecast(symbol: string, days: number): Promise<any | null> {
    const key = `forecast:${symbol}:${days}d`;
    return await this.get<any>(key);
  }

  async setCachedForecast(symbol: string, days: number, data: any, ttl = 3600): Promise<boolean> {
    const key = `forecast:${symbol}:${days}d`;
    return await this.set(key, data, ttl);
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

  async rateLimitCheck(identifier: string, limit: number, windowSeconds: number): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
    const key = `ratelimit:${identifier}`;
    const current = await this.incrementCounter(key, windowSeconds);

    return {
      allowed: current <= limit,
      remaining: Math.max(0, limit - current),
      resetTime: Date.now() + (windowSeconds * 1000)
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