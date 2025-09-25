// Third-party packages
import type { MongoClient as MongoClientType, Db, Collection } from 'mongodb';

// Local imports
import type {
  PatternMatch,
  AssetSymbol,
  Timestamp
} from '../types/index.js';
import { loggers } from '../utils/logger.js';

// Make mongodb optional - will be loaded dynamically
let MongoClient: typeof MongoClientType | undefined;

// Strongly typed MongoDB document interfaces
export type ImpactSeverity = 'low' | 'medium' | 'high';
export type PatternId = string & { readonly __brand: 'PatternId' };
export type MongoObjectId = string & { readonly __brand: 'MongoObjectId' };

export interface MarketConditions {
  readonly assets: readonly AssetSymbol[];
  readonly sentiment: number;
  readonly volatility: number;
  readonly volume: number;
  readonly timestamp: Timestamp;
}

export interface PatternOutcome {
  readonly price_change_24h: Record<AssetSymbol, number>;
  readonly duration_hours: number;
  readonly impact_severity: ImpactSeverity;
}

export interface PatternMetadata {
  readonly source: string;
  readonly confidence: number;
  readonly tags: readonly string[];
  readonly created_at: Timestamp;
  readonly updated_at: Timestamp;
}

export interface MarketPattern {
  readonly _id?: MongoObjectId;
  readonly id: PatternId;
  readonly event: string;
  readonly market_conditions: MarketConditions;
  readonly outcome: PatternOutcome;
  readonly metadata: PatternMetadata;
  readonly embedding_text?: string;
}

export interface PriceHistory {
  symbol: string;
  price: number;
  volume: number;
  market_cap?: number;
  change_24h: number;
  timestamp: Date;
}

export interface NewsCache {
  title: string;
  content: string;
  source: string;
  url: string;
  timestamp: Date;
  sentiment_score: number;
  symbols: string[];
  ttl: Date;
}

// Database operation results
export interface DatabaseStats {
  readonly total_patterns: number;
  readonly recent_patterns: number;
  readonly total_price_records: number;
  readonly total_news_records: number;
  readonly database_size_mb: number;
}

export class MemoryLayer {
  private client?: MongoClientType;
  private db?: Db;
  private patternsCollection?: Collection<MarketPattern>;
  private priceHistoryCollection?: Collection<PriceHistory>;
  private newsCacheCollection?: Collection<NewsCache>;
  private connectionString: string;
  private dbName = 'mcp_oracle';
  private logger = loggers.mongodb;

  constructor(connectionString?: string) {
    // Default to Docker-compatible MongoDB URL
    this.connectionString = connectionString || process.env['MONGODB_URL'] || 'mongodb://localhost:27017/mcp_oracle';
  }

  async initialize(): Promise<void> {
    // Try to load MongoDB dynamically with timeout
    if (!MongoClient) {
      try {
        const mongodb = await Promise.race([
          import('mongodb'),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('MongoDB import timeout')), 5000)
          )
        ]) as any;
        MongoClient = mongodb.MongoClient;
        this.logger.info('📦 MongoDB package loaded successfully');
      } catch (error) {
        this.logger.warn('📦 MongoDB package not available or timeout, skipping initialization:', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return;
      }
    }

    if (!MongoClient) {
      this.logger.warn('📦 MongoDB client not loaded - memory features disabled');
      return;
    }

    try {
      // Parse and fix MongoDB URL for Docker networking
      let fixedConnectionString = this.connectionString;

      // Fix localhost references for Docker environment
      if (fixedConnectionString.includes('localhost:27017')) {
        fixedConnectionString = fixedConnectionString.replace('localhost:27017', 'mongodb:27017');
        this.logger.info(`🔧 Fixed MongoDB URL for Docker: ${fixedConnectionString.replace(/:\/\/[^@]+@/, '://***@')}`);
      }

      // Create client with conservative timeouts to prevent blocking
      this.client = new MongoClient(fixedConnectionString, {
        connectTimeoutMS: 3000,      // Reduced from 10000
        serverSelectionTimeoutMS: 2000, // Reduced from 5000
        socketTimeoutMS: 5000,       // Reduced from 45000
        maxPoolSize: 5,              // Reduced from 10
        retryWrites: false,          // Disable to fail fast
        retryReads: false,           // Disable to fail fast
        maxIdleTimeMS: 30000,        // Close idle connections
        heartbeatFrequencyMS: 10000  // Health check frequency
      });

      // Connect with timeout wrapper
      await Promise.race([
        this.client.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('MongoDB connection timeout')), 4000)
        )
      ]);

      // Test the connection with timeout
      await Promise.race([
        this.client.db('admin').command({ ping: 1 }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('MongoDB ping timeout')), 2000)
        )
      ]);

      this.db = this.client.db(this.dbName);
      this.patternsCollection = this.db.collection('market_patterns');
      this.priceHistoryCollection = this.db.collection('price_history');
      this.newsCacheCollection = this.db.collection('news_cache');

      // Create indexes in background, don't wait
      this.createIndexes().catch(error => {
        this.logger.warn('⚠️ Index creation failed (non-blocking):', error);
      });

      this.logger.info('✅ MongoDB MemoryLayer initialized successfully');
    } catch (error) {
      this.logger.error('❌ Failed to initialize MongoDB:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        connectionString: this.connectionString.replace(/:\/\/[^@]+@/, '://***@')
      });
      this.logger.warn('⚠️ MongoDB features will be disabled - continuing without memory layer');

      // Clean up partial connections
      if (this.client) {
        try {
          await this.client.close();
        } catch (closeError) {
          this.logger.debug('Error closing failed MongoDB connection:', closeError);
        }
        this.client = undefined as any;
      }

      // Reset all collections to prevent partial state
      this.db = undefined as any;
      this.patternsCollection = undefined as any;
      this.priceHistoryCollection = undefined as any;
      this.newsCacheCollection = undefined as any;

      // Don't throw error - allow service to work without MongoDB
    }
  }

  private async createIndexes(): Promise<void> {
    try {
      // Text search indexes for patterns
      await this.patternsCollection!.createIndex(
        {
          event: 'text',
          'metadata.tags': 'text',
          'market_conditions.assets': 'text',
          embedding_text: 'text'
        },
        { name: 'pattern_text_search' }
      );

      // Compound index for pattern queries
      await this.patternsCollection!.createIndex({
        'outcome.impact_severity': 1,
        'metadata.confidence': -1,
        'market_conditions.timestamp': -1
      });

      // Price history indexes
      await this.priceHistoryCollection!.createIndex({ symbol: 1, timestamp: -1 });
      await this.priceHistoryCollection!.createIndex({ timestamp: -1 });

      // News cache indexes
      await this.newsCacheCollection!.createIndex({ symbols: 1, timestamp: -1 });
      await this.newsCacheCollection!.createIndex({ ttl: 1 }, { expireAfterSeconds: 0 });
      await this.newsCacheCollection!.createIndex(
        { title: 'text', content: 'text' },
        { name: 'news_text_search' }
      );

      this.logger.info('MongoDB indexes created successfully');
    } catch (error) {
      this.logger.warn('Index creation warning:', error);
    }
  }

  async storePattern(pattern: MarketPattern): Promise<void> {
    if (!this.patternsCollection) {
      await this.initialize();
    }

    if (!this.patternsCollection) {
      this.logger.warn('MongoDB not available, skipping pattern storage');
      return;
    }

    try {
      const patternWithEmbedding = {
        ...pattern,
        embedding_text: this.createEmbeddingText(pattern)
      };

      await this.patternsCollection.insertOne(patternWithEmbedding);
      this.logger.info(`Pattern stored: ${pattern.event} (${pattern.id})`);
    } catch (error) {
      this.logger.error('Failed to store pattern:', error);
      throw error;
    }
  }

  async findSimilarPatterns(
    query: string,
    limit = 5
  ): Promise<PatternMatch[]> {
    if (!this.patternsCollection) {
      await this.initialize();
    }

    try {
      const results = await this.patternsCollection!
        .find({ $text: { $search: query } })
        .project({ score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' }, 'metadata.confidence': -1 })
        .limit(limit)
        .toArray();

      return results.map((pattern: any) => ({
        pattern_id: pattern.id,
        similarity_score: pattern.score || 0.5,
        historical_outcome: `${pattern.outcome.impact_severity} impact: ${pattern.outcome.duration_hours}h duration`,
        confidence: pattern.metadata.confidence,
        timeframe: pattern.market_conditions.timestamp,
      }));
    } catch (error) {
      this.logger.error('Failed to find similar patterns:', error);
      return [];
    }
  }

  async storePriceData(priceData: PriceHistory[]): Promise<void> {
    if (!this.priceHistoryCollection) {
      await this.initialize();
    }

    try {
      if (priceData.length > 0) {
        await this.priceHistoryCollection!.insertMany(priceData);
      }
    } catch (error) {
      this.logger.error('Failed to store price data:', error);
      throw error;
    }
  }

  async getPriceHistory(symbol: string, hours = 24): Promise<PriceHistory[]> {
    if (!this.priceHistoryCollection) {
      await this.initialize();
    }

    try {
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

      return await this.priceHistoryCollection!
        .find({
          symbol,
          timestamp: { $gte: cutoff }
        })
        .sort({ timestamp: -1 })
        .toArray();
    } catch (error) {
      this.logger.error('Failed to get price history:', error);
      return [];
    }
  }

  async cacheNews(news: NewsCache[]): Promise<void> {
    if (!this.newsCacheCollection) {
      await this.initialize();
    }

    try {
      if (news.length > 0) {
        // Set TTL for 1 hour from now
        const ttl = new Date(Date.now() + 60 * 60 * 1000);
        const newsWithTTL = news.map(item => ({ ...item, ttl }));

        await this.newsCacheCollection!.insertMany(newsWithTTL);
      }
    } catch (error) {
      this.logger.error('Failed to cache news:', error);
      throw error;
    }
  }

  async getCachedNews(symbols: string[], hours = 24): Promise<NewsCache[]> {
    if (!this.newsCacheCollection) {
      await this.initialize();
    }

    try {
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

      return await this.newsCacheCollection!
        .find({
          symbols: { $in: symbols },
          timestamp: { $gte: cutoff }
        })
        .sort({ timestamp: -1 })
        .toArray();
    } catch (error) {
      this.logger.error('Failed to get cached news:', error);
      return [];
    }
  }

  private createEmbeddingText(pattern: MarketPattern): string {
    return `${pattern.event} ${pattern.market_conditions.assets.join(' ')} sentiment:${pattern.market_conditions.sentiment} volatility:${pattern.market_conditions.volatility} impact:${pattern.outcome.impact_severity} duration:${pattern.outcome.duration_hours}h ${pattern.metadata.tags.join(' ')}`;
  }

  async getPatternStats(): Promise<{ total: number; recent: number }> {
    if (!this.patternsCollection) {
      await this.initialize();
    }

    try {
      const total = await this.patternsCollection!.countDocuments();
      const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
      const recent = await this.patternsCollection!.countDocuments({
        'market_conditions.timestamp': { $gte: recentCutoff.toISOString() }
      });

      return { total, recent };
    } catch (error) {
      this.logger.error('Failed to get pattern stats:', error);
      return { total: 0, recent: 0 };
    }
  }

  async clearAllPatterns(): Promise<void> {
    if (!this.patternsCollection) {
      await this.initialize();
    }

    try {
      await this.patternsCollection!.deleteMany({});
      this.logger.info('All patterns cleared');
    } catch (error) {
      this.logger.error('Failed to clear patterns:', error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    try {
      // Clean up expired news cache (MongoDB TTL should handle this automatically)
      if (this.newsCacheCollection) {
        await this.newsCacheCollection.deleteMany({
          ttl: { $lt: new Date() }
        });
      }

      // Clean up old price history (keep last 30 days)
      if (this.priceHistoryCollection) {
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        await this.priceHistoryCollection.deleteMany({
          timestamp: { $lt: cutoff }
        });
      }
    } catch (error) {
      this.logger.error('Cleanup failed:', error);
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.logger.info('MongoDB connection closed');
    }
  }
}