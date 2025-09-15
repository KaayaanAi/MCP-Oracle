import axios, { AxiosInstance } from 'axios';
import type { NewsItem } from '../types/index.js';
import { loggers } from '../utils/logger.js';

export interface NewsAPIArticle {
  source: {
    id: string | null;
    name: string;
  };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
}

export interface NewsAPIResponse {
  status: string;
  totalResults: number;
  articles: NewsAPIArticle[];
}

export class NewsAPIService {
  private client: AxiosInstance;
  private baseUrl = 'https://newsapi.org/v2';
  private apiKey: string;
  private logger = loggers.newsapi;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      headers: {
        'X-API-Key': apiKey,
        'User-Agent': 'MCP-Oracle/1.0.0'
      }
    });

    this.setupRequestInterceptor();
  }

  private setupRequestInterceptor(): void {
    this.client.interceptors.request.use(
      (config) => {
        this.logger.debug(`NewsAPI call: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logger.error('NewsAPI error:', {
          status: error.response?.status,
          data: error.response?.data
        });
        if (error.response?.status === 429) {
          this.logger.warn('NewsAPI rate limit hit - consider upgrading plan');
        }
        return Promise.reject(error);
      }
    );
  }

  async getFinancialNews(
    symbols: string[],
    hours = 24,
    pageSize = 20
  ): Promise<NewsItem[]> {
    try {
      const query = this.buildFinancialQuery(symbols);
      const fromDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      const response = await this.client.get<NewsAPIResponse>('/everything', {
        params: {
          q: query,
          from: fromDate,
          sortBy: 'publishedAt',
          language: 'en',
          pageSize,
          domains: 'reuters.com,bloomberg.com,cnbc.com,marketwatch.com,yahoo.com,coindesk.com,cointelegraph.com'
        }
      });

      return response.data.articles
        .filter(article => article.title && article.description)
        .map(article => this.transformToNewsItem(article, symbols));
    } catch (error) {
      this.logger.error('Failed to fetch financial news:', error);
      throw new Error('NewsAPI financial news error');
    }
  }

  async getCryptoNews(
    symbols: string[],
    hours = 24,
    pageSize = 15
  ): Promise<NewsItem[]> {
    try {
      const cryptoQuery = this.buildCryptoQuery(symbols);
      const fromDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      const response = await this.client.get<NewsAPIResponse>('/everything', {
        params: {
          q: cryptoQuery,
          from: fromDate,
          sortBy: 'publishedAt',
          language: 'en',
          pageSize,
          domains: 'coindesk.com,cointelegraph.com,decrypt.co,bitcoinmagazine.com,theblock.co,cryptoslate.com'
        }
      });

      return response.data.articles
        .filter(article => article.title && article.description)
        .map(article => this.transformToNewsItem(article, symbols));
    } catch (error) {
      this.logger.error('Failed to fetch crypto news:', error);
      throw new Error('NewsAPI crypto news error');
    }
  }

  async getTopBusinessNews(pageSize = 10): Promise<NewsItem[]> {
    try {
      const response = await this.client.get<NewsAPIResponse>('/top-headlines', {
        params: {
          category: 'business',
          language: 'en',
          country: 'us',
          pageSize
        }
      });

      return response.data.articles
        .filter(article => article.title && article.description)
        .map(article => this.transformToNewsItem(article, []));
    } catch (error) {
      this.logger.error('Failed to fetch top business news:', error);
      throw new Error('NewsAPI top business news error');
    }
  }

  async searchNews(
    query: string,
    hours = 24,
    pageSize = 15
  ): Promise<NewsItem[]> {
    try {
      const fromDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      const response = await this.client.get<NewsAPIResponse>('/everything', {
        params: {
          q: query,
          from: fromDate,
          sortBy: 'relevancy',
          language: 'en',
          pageSize
        }
      });

      return response.data.articles
        .filter(article => article.title && article.description)
        .map(article => this.transformToNewsItem(article, []));
    } catch (error) {
      this.logger.error(`Failed to search news for "${query}":`, error);
      throw new Error('NewsAPI search error');
    }
  }

  private buildFinancialQuery(symbols: string[]): string {
    const baseTerms = ['finance', 'market', 'economy', 'investment', 'trading'];
    const symbolTerms = symbols.map(symbol => {
      // Remove trading pair suffixes
      const cleanSymbol = symbol.replace(/USDT$|USD$/, '');
      return this.getFinancialTerms(cleanSymbol);
    }).flat();

    const allTerms = [...baseTerms, ...symbolTerms];
    return allTerms.slice(0, 10).join(' OR '); // Limit to avoid query length issues
  }

  private buildCryptoQuery(symbols: string[]): string {
    const baseTerms = ['cryptocurrency', 'bitcoin', 'ethereum', 'crypto', 'blockchain'];
    const symbolTerms = symbols.map(symbol => {
      const cleanSymbol = symbol.replace(/USDT$|USD$/, '');
      return this.getCryptoTerms(cleanSymbol);
    }).flat();

    const allTerms = [...baseTerms, ...symbolTerms];
    return allTerms.slice(0, 10).join(' OR ');
  }

  private getFinancialTerms(symbol: string): string[] {
    const termMap: Record<string, string[]> = {
      'BTC': ['Bitcoin', 'BTC', 'cryptocurrency'],
      'ETH': ['Ethereum', 'ETH', 'crypto'],
      'AAPL': ['Apple', 'AAPL', 'iPhone'],
      'TSLA': ['Tesla', 'TSLA', 'electric vehicle'],
      'NVDA': ['NVIDIA', 'NVDA', 'AI chip'],
      'GOOGL': ['Google', 'Alphabet', 'GOOGL'],
      'MSFT': ['Microsoft', 'MSFT', 'cloud'],
      'AMZN': ['Amazon', 'AMZN', 'e-commerce']
    };

    return termMap[symbol] || [symbol];
  }

  private getCryptoTerms(symbol: string): string[] {
    const termMap: Record<string, string[]> = {
      'BTC': ['Bitcoin', 'BTC'],
      'ETH': ['Ethereum', 'ETH'],
      'BNB': ['Binance', 'BNB'],
      'SOL': ['Solana', 'SOL'],
      'ADA': ['Cardano', 'ADA'],
      'XRP': ['Ripple', 'XRP'],
      'DOGE': ['Dogecoin', 'DOGE'],
      'MATIC': ['Polygon', 'MATIC'],
      'DOT': ['Polkadot', 'DOT'],
      'AVAX': ['Avalanche', 'AVAX']
    };

    return termMap[symbol] || [symbol];
  }

  private transformToNewsItem(article: NewsAPIArticle, symbols: string[]): NewsItem {
    return {
      title: article.title,
      content: article.description || article.content || '',
      source: article.source.name,
      url: article.url,
      timestamp: article.publishedAt,
      sentiment_score: this.calculateSentiment(article.title, article.description),
      relevance_score: this.calculateRelevance(article, symbols)
    };
  }

  private calculateSentiment(title: string, description: string | null): number {
    const text = `${title} ${description || ''}`.toLowerCase();

    const positiveWords = ['gains', 'rises', 'bullish', 'surge', 'rally', 'breakthrough', 'success', 'positive', 'up', 'high', 'growth', 'boost', 'strong'];
    const negativeWords = ['falls', 'drops', 'bearish', 'crash', 'decline', 'negative', 'down', 'low', 'loss', 'weak', 'concern', 'risk', 'fear'];

    let sentiment = 0;

    positiveWords.forEach(word => {
      if (text.includes(word)) sentiment += 0.1;
    });

    negativeWords.forEach(word => {
      if (text.includes(word)) sentiment -= 0.1;
    });

    return Math.max(-1, Math.min(1, sentiment));
  }

  private calculateRelevance(article: NewsAPIArticle, symbols: string[]): number {
    let relevance = 0.5; // Base relevance

    const text = `${article.title} ${article.description || ''}`.toLowerCase();

    // Check for symbol mentions
    symbols.forEach(symbol => {
      const cleanSymbol = symbol.replace(/USDT$|USD$/, '').toLowerCase();
      if (text.includes(cleanSymbol.toLowerCase())) {
        relevance += 0.3;
      }
    });

    // Check for financial keywords
    const financialKeywords = ['market', 'price', 'trading', 'investment', 'finance', 'economy'];
    financialKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        relevance += 0.1;
      }
    });

    // Source credibility boost
    const credibleSources = ['reuters', 'bloomberg', 'cnbc', 'marketwatch'];
    if (credibleSources.some(source => article.source.name.toLowerCase().includes(source))) {
      relevance += 0.2;
    }

    return Math.min(1, relevance);
  }

  async getMarketMovingNews(hours = 24): Promise<NewsItem[]> {
    try {
      const query = 'Federal Reserve OR inflation OR interest rates OR GDP OR unemployment OR recession OR bull market OR bear market';
      const fromDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      const response = await this.client.get<NewsAPIResponse>('/everything', {
        params: {
          q: query,
          from: fromDate,
          sortBy: 'relevancy',
          language: 'en',
          pageSize: 15,
          domains: 'reuters.com,bloomberg.com,cnbc.com,marketwatch.com,wsj.com'
        }
      });

      return response.data.articles
        .filter(article => article.title && article.description)
        .map(article => this.transformToNewsItem(article, []))
        .sort((a, b) => b.relevance_score - a.relevance_score);
    } catch (error) {
      this.logger.error('Failed to fetch market moving news:', error);
      return [];
    }
  }
}