import axios, { AxiosInstance } from 'axios';
import type { NewsItem } from '../types/index.js';
import { loggers } from '../utils/logger.js';

export interface CryptoPanicPost {
  kind: 'news' | 'media';
  domain: string;
  source: {
    title: string;
    region: string;
    domain: string;
    path: string | null;
  };
  title: string;
  published_at: string;
  slug: string;
  id: number;
  url: string;
  created_at: string;
  votes: {
    negative: number;
    positive: number;
    important: number;
    liked: number;
    disliked: number;
    lol: number;
    toxic: number;
    saved: number;
    comments: number;
  };
  currencies: Array<{
    code: string;
    title: string;
    slug: string;
    url: string;
  }>;
}

export interface CryptoPanicResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: CryptoPanicPost[];
}

export class CryptoPanicService {
  private client: AxiosInstance;
  private baseUrl = 'https://cryptopanic.com/api/v1';
  private apiKey: string;
  private logger = loggers.cryptopanic;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      params: {
        auth_token: apiKey
      }
    });

    this.setupRequestInterceptor();
  }

  private setupRequestInterceptor(): void {
    this.client.interceptors.request.use(
      (config) => {
        this.logger.debug(`CryptoPanic API call: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logger.error('CryptoPanic API error:', {
          status: error.response?.status,
          data: error.response?.data
        });
        if (error.response?.status === 429) {
          this.logger.warn('CryptoPanic rate limit hit - consider upgrading plan');
        }
        return Promise.reject(error);
      }
    );
  }

  async getCryptoNews(
    symbols: string[] = [],
    kind: 'news' | 'media' | 'all' = 'all',
    region: 'en' | 'de' | 'es' | 'fr' | 'nl' | 'it' | 'pt' | 'ru' = 'en'
  ): Promise<NewsItem[]> {
    try {
      const currencies = this.symbolsToCryptoPanicCodes(symbols);

      const response = await this.client.get<CryptoPanicResponse>('/posts/', {
        params: {
          ...(kind !== 'all' && { kind }),
          ...(currencies.length > 0 && { currencies: currencies.join(',') }),
          region,
          filter: 'hot',
          page_size: 20
        }
      });

      return response.data.results.map(post => this.transformToNewsItem(post));
    } catch (error) {
      this.logger.error('Failed to fetch crypto news from CryptoPanic:', error);
      throw new Error('CryptoPanic API error');
    }
  }

  async getTopCryptoNews(pageSize = 15): Promise<NewsItem[]> {
    try {
      const response = await this.client.get<CryptoPanicResponse>('/posts/', {
        params: {
          filter: 'hot',
          page_size: pageSize,
          region: 'en'
        }
      });

      return response.data.results.map(post => this.transformToNewsItem(post));
    } catch (error) {
      this.logger.error('Failed to fetch top crypto news:', error);
      throw new Error('CryptoPanic top news error');
    }
  }

  async getNewsByCurrency(
    currency: string,
    kind: 'news' | 'media' | 'all' = 'all',
    pageSize = 10
  ): Promise<NewsItem[]> {
    try {
      const cryptoPanicCode = this.symbolToCryptoPanicCode(currency);

      const response = await this.client.get<CryptoPanicResponse>('/posts/', {
        params: {
          currencies: cryptoPanicCode,
          ...(kind !== 'all' && { kind }),
          filter: 'hot',
          page_size: pageSize,
          region: 'en'
        }
      });

      return response.data.results.map(post => this.transformToNewsItem(post));
    } catch (error) {
      this.logger.error(`Failed to fetch news for ${currency}:`, error);
      throw new Error('CryptoPanic currency news error');
    }
  }

  async getTrendingNews(pageSize = 20): Promise<NewsItem[]> {
    try {
      const response = await this.client.get<CryptoPanicResponse>('/posts/', {
        params: {
          filter: 'trending',
          page_size: pageSize,
          region: 'en'
        }
      });

      return response.data.results.map(post => this.transformToNewsItem(post));
    } catch (error) {
      this.logger.error('Failed to fetch trending crypto news:', error);
      throw new Error('CryptoPanic trending news error');
    }
  }

  async getBullishNews(symbols: string[] = [], pageSize = 15): Promise<NewsItem[]> {
    try {
      const currencies = this.symbolsToCryptoPanicCodes(symbols);

      const response = await this.client.get<CryptoPanicResponse>('/posts/', {
        params: {
          ...(currencies.length > 0 && { currencies: currencies.join(',') }),
          filter: 'rising',
          page_size: pageSize,
          region: 'en'
        }
      });

      return response.data.results
        .filter(post => this.isBullishNews(post))
        .map(post => this.transformToNewsItem(post));
    } catch (error) {
      this.logger.error('Failed to fetch bullish news:', error);
      return [];
    }
  }

  async getBearishNews(symbols: string[] = [], pageSize = 15): Promise<NewsItem[]> {
    try {
      const currencies = this.symbolsToCryptoPanicCodes(symbols);

      const response = await this.client.get<CryptoPanicResponse>('/posts/', {
        params: {
          ...(currencies.length > 0 && { currencies: currencies.join(',') }),
          filter: 'hot',
          page_size: pageSize * 2, // Get more to filter for bearish
          region: 'en'
        }
      });

      return response.data.results
        .filter(post => this.isBearishNews(post))
        .slice(0, pageSize)
        .map(post => this.transformToNewsItem(post));
    } catch (error) {
      this.logger.error('Failed to fetch bearish news:', error);
      return [];
    }
  }

  private symbolsToCryptoPanicCodes(symbols: string[]): string[] {
    return symbols.map(symbol => this.symbolToCryptoPanicCode(symbol));
  }

  private symbolToCryptoPanicCode(symbol: string): string {
    const symbolMap: Record<string, string> = {
      'BTC': 'BTC',
      'ETH': 'ETH',
      'USDT': 'USDT',
      'BNB': 'BNB',
      'SOL': 'SOL',
      'USDC': 'USDC',
      'XRP': 'XRP',
      'DOGE': 'DOGE',
      'TON': 'TON',
      'ADA': 'ADA',
      'SHIB': 'SHIB',
      'AVAX': 'AVAX',
      'TRX': 'TRX',
      'DOT': 'DOT',
      'LINK': 'LINK',
      'MATIC': 'MATIC',
      'ICP': 'ICP',
      'LTC': 'LTC',
      'UNI': 'UNI',
      'ATOM': 'ATOM'
    };

    const normalizedSymbol = symbol.replace('USDT', '').replace('USD', '');
    return symbolMap[normalizedSymbol] || normalizedSymbol;
  }

  private transformToNewsItem(post: CryptoPanicPost): NewsItem {
    const sentiment = this.calculateSentiment(post);
    const relevance = this.calculateRelevance(post);

    return {
      title: post.title,
      content: `${post.title} - ${post.currencies.map(c => c.code).join(', ')}`,
      source: `CryptoPanic (${post.source.title})`,
      url: post.url,
      timestamp: post.published_at,
      sentiment_score: sentiment,
      relevance_score: relevance
    };
  }

  private calculateSentiment(post: CryptoPanicPost): number {
    const title = post.title.toLowerCase();
    const votes = post.votes || { positive: 0, negative: 0, important: 0, liked: 0, disliked: 0, lol: 0, toxic: 0, saved: 0 };

    // Base sentiment from votes
    let sentiment = 0;

    // Positive indicators
    if (votes.positive > votes.negative) {
      sentiment += 0.3;
    }

    if (votes.important > 10) {
      sentiment += 0.2;
    }

    // Negative indicators
    if (votes.negative > votes.positive) {
      sentiment -= 0.3;
    }

    if (votes.toxic > 5) {
      sentiment -= 0.4;
    }

    // Title sentiment analysis
    const bullishWords = ['surge', 'rally', 'bullish', 'gains', 'rises', 'breakthrough', 'adoption', 'partnership', 'launch', 'upgrade'];
    const bearishWords = ['crash', 'dump', 'bearish', 'falls', 'drops', 'hack', 'regulation', 'ban', 'concern', 'risk'];

    bullishWords.forEach(word => {
      if (title.includes(word)) sentiment += 0.15;
    });

    bearishWords.forEach(word => {
      if (title.includes(word)) sentiment -= 0.15;
    });

    return Math.max(-1, Math.min(1, sentiment));
  }

  private calculateRelevance(post: CryptoPanicPost): number {
    let relevance = 0.6; // Base relevance
    const votes = post.votes || { positive: 0, negative: 0, important: 0, liked: 0, disliked: 0, lol: 0, toxic: 0, saved: 0 };

    // Vote-based relevance
    const totalVotes = votes.positive + votes.negative + votes.important;
    if (totalVotes > 20) relevance += 0.2;
    if (totalVotes > 50) relevance += 0.1;

    // Important votes boost
    if (votes.important > 10) relevance += 0.15;

    // Source credibility
    const credibleSources = ['coindesk', 'cointelegraph', 'decrypt', 'theblock'];
    if (credibleSources.some(source => post.source.domain.includes(source))) {
      relevance += 0.1;
    }

    // Currency count (more currencies = more relevant for general analysis)
    if (post.currencies.length > 1) {
      relevance += 0.05;
    }

    return Math.min(1, relevance);
  }

  private isBullishNews(post: CryptoPanicPost): boolean {
    const title = post.title.toLowerCase();
    const bullishWords = ['surge', 'rally', 'bullish', 'gains', 'rises', 'breakthrough', 'adoption', 'partnership', 'launch', 'upgrade', 'moon', 'pump'];
    const sentiment = this.calculateSentiment(post);

    return bullishWords.some(word => title.includes(word)) ||
           sentiment > 0.2 ||
           post.votes.positive > post.votes.negative * 2;
  }

  private isBearishNews(post: CryptoPanicPost): boolean {
    const title = post.title.toLowerCase();
    const bearishWords = ['crash', 'dump', 'bearish', 'falls', 'drops', 'hack', 'regulation', 'ban', 'concern', 'risk', 'fear', 'sell'];
    const sentiment = this.calculateSentiment(post);

    return bearishWords.some(word => title.includes(word)) ||
           sentiment < -0.2 ||
           post.votes.negative > post.votes.positive * 2;
  }

  async getMarketSentiment(symbols: string[] = []): Promise<{
    overall_sentiment: number;
    bullish_count: number;
    bearish_count: number;
    neutral_count: number;
    total_posts: number;
  }> {
    try {
      const currencies = this.symbolsToCryptoPanicCodes(symbols);

      const response = await this.client.get<CryptoPanicResponse>('/posts/', {
        params: {
          ...(currencies.length > 0 && { currencies: currencies.join(',') }),
          filter: 'hot',
          page_size: 50,
          region: 'en'
        }
      });

      const posts = response.data.results;
      let totalSentiment = 0;
      let bullishCount = 0;
      let bearishCount = 0;
      let neutralCount = 0;

      posts.forEach(post => {
        const sentiment = this.calculateSentiment(post);
        totalSentiment += sentiment;

        if (sentiment > 0.1) {
          bullishCount++;
        } else if (sentiment < -0.1) {
          bearishCount++;
        } else {
          neutralCount++;
        }
      });

      return {
        overall_sentiment: posts.length > 0 ? totalSentiment / posts.length : 0,
        bullish_count: bullishCount,
        bearish_count: bearishCount,
        neutral_count: neutralCount,
        total_posts: posts.length
      };
    } catch (error) {
      this.logger.error('Failed to get market sentiment:', error);
      return {
        overall_sentiment: 0,
        bullish_count: 0,
        bearish_count: 0,
        neutral_count: 0,
        total_posts: 0
      };
    }
  }
}