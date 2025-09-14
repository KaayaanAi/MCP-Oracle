import { ChromaClient, Collection } from 'chromadb';
import type { PatternMatch } from '../types/index.js';

export interface MarketPattern {
  id: string;
  event: string;
  market_conditions: {
    assets: string[];
    sentiment: number;
    volatility: number;
    volume: number;
    timestamp: string;
  };
  outcome: {
    price_change_24h: Record<string, number>;
    duration_hours: number;
    impact_severity: 'low' | 'medium' | 'high';
  };
  metadata: {
    source: string;
    confidence: number;
    tags: string[];
  };
}

export class MemoryLayer {
  private client: ChromaClient;
  private collection?: Collection;
  private collectionName = 'mcp_oracle_patterns';

  constructor(chromaDbUrl = 'http://localhost:8000') {
    this.client = new ChromaClient({ path: chromaDbUrl });
  }

  async initialize(): Promise<void> {
    try {
      // Get or create collection
      try {
        this.collection = await this.client.getCollection({
          name: this.collectionName
        });
      } catch (error) {
        // Collection doesn't exist, create it
        this.collection = await this.client.createCollection({
          name: this.collectionName,
          metadata: {
            description: 'MCP Oracle market pattern storage',
            created: new Date().toISOString()
          }
        });
      }
    } catch (error) {
      console.error('Failed to initialize ChromaDB:', error);
      throw new Error('ChromaDB connection failed');
    }
  }

  async storePattern(pattern: MarketPattern): Promise<void> {
    if (!this.collection) {
      await this.initialize();
    }

    try {
      // Create embedding text from pattern
      const embeddingText = this.createEmbeddingText(pattern);

      // Store in ChromaDB
      await this.collection!.add({
        ids: [pattern.id],
        documents: [embeddingText],
        metadatas: [{
          event: pattern.event,
          timestamp: pattern.market_conditions.timestamp,
          impact_severity: pattern.outcome.impact_severity,
          confidence: pattern.metadata.confidence,
          source: pattern.metadata.source,
          tags: JSON.stringify(pattern.metadata.tags),
          assets: JSON.stringify(pattern.market_conditions.assets),
          sentiment: pattern.market_conditions.sentiment,
          volatility: pattern.market_conditions.volatility,
          duration_hours: pattern.outcome.duration_hours
        }]
      });

      console.log(`✅ Pattern stored: ${pattern.event} (${pattern.id})`);
    } catch (error) {
      console.error('Failed to store pattern:', error);
      throw error;
    }
  }

  async findSimilarPatterns(
    query: string,
    limit = 5
  ): Promise<PatternMatch[]> {
    if (!this.collection) {
      await this.initialize();
    }

    try {
      // Query for similar patterns
      const results = await this.collection!.query({
        queryTexts: [query],
        nResults: limit
      });

      // Transform results to PatternMatch format
      const patterns: PatternMatch[] = [];

      if (results.ids && results.ids[0]) {
        for (let i = 0; i < results.ids[0].length; i++) {
          const metadata = results.metadatas?.[0]?.[i];
          const distance = results.distances?.[0]?.[i] ?? 1;
          const document = results.documents?.[0]?.[i];

          if (metadata) {
            patterns.push({
              pattern_id: results.ids[0][i],
              similarity_score: 1 - distance, // Convert distance to similarity
              historical_outcome: `${metadata.impact_severity} impact: ${metadata.duration_hours}h duration`,
              confidence: (metadata.confidence as number) || 0,
              timeframe: metadata.timestamp as string,
            });
          }
        }
      }

      return patterns;
    } catch (error) {
      console.error('Failed to find similar patterns:', error);
      throw error;
    }
  }

  private createEmbeddingText(pattern: MarketPattern): string {
    return `${pattern.event} ${pattern.market_conditions.assets.join(' ')} sentiment:${pattern.market_conditions.sentiment} volatility:${pattern.market_conditions.volatility} impact:${pattern.outcome.impact_severity} duration:${pattern.outcome.duration_hours}h ${pattern.metadata.tags.join(' ')}`;
  }

  async getPatternStats(): Promise<{ total: number; recent: number }> {
    if (!this.collection) {
      await this.initialize();
    }

    try {
      const count = await this.collection!.count();
      return {
        total: count,
        recent: count // For now, return total as recent
      };
    } catch (error) {
      console.error('Failed to get pattern stats:', error);
      return { total: 0, recent: 0 };
    }
  }

  async clearAllPatterns(): Promise<void> {
    if (!this.collection) {
      await this.initialize();
    }

    try {
      await this.client.deleteCollection({ name: this.collectionName });
      this.collection = await this.client.createCollection({
        name: this.collectionName,
        metadata: {
          description: 'MCP Oracle market pattern storage',
          created: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Failed to clear patterns:', error);
      throw error;
    }
  }
}