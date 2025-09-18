// Third-party packages
import axios, { AxiosInstance } from 'axios';

// Local imports
import { loggers } from '../utils/logger.js';

export interface NewsArticle {
  id: string;
  title: string;
  content: string;
  source: string;
  url: string;
  timestamp: string;
  sentiment_score: number;
  relevance_score: number;
  category: 'crypto' | 'stock' | 'forex' | 'general';
  symbols: string[];
}

export interface NewsAPIResponse {
  status: string;
  totalResults: number;
  articles: {
    source: { id: string | null; name: string };
    author: string | null;
    title: string;
    description: string | null;
    url: string;
    urlToImage: string | null;
    publishedAt: string;
    content: string | null;
  }[];
}

export interface CryptoPanicResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: {
    id: number;
    kind: string;
    domain: string;
    source: { title: string; region: string; domain: string };
    title: string;
    published_at: string;
    slug: string;
    url: string;
    created_at: string;
    votes: { negative: number; positive: number; important: number; liked: number; disliked: number; lol: number; toxic: number; saved: number };
    currencies: { code: string; title: string; slug: string; url: string }[];
  }[];
}

export class NewsService {
  private newsAPIClient: AxiosInstance;
  private cryptoPanicClient: AxiosInstance;
  private logger = loggers.news;

  constructor(newsAPIKey: string, cryptoPanicKey: string) {

    // NewsAPI client
    this.newsAPIClient = axios.create({
      baseURL: 'https://newsapi.org/v2',
      timeout: 30000,
      headers: {
        'X-API-Key': newsAPIKey,
        'User-Agent': 'MCP-Oracle/1.0.0'
      }
    });

    // CryptoPanic client
    this.cryptoPanicClient = axios.create({
      baseURL: 'https://cryptopanic.com/api/v1',
      timeout: 30000,
      params: {
        auth_token: cryptoPanicKey
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // NewsAPI interceptors
    this.newsAPIClient.interceptors.request.use(
      (config) => {
        this.logger.debug(`📰 NewsAPI call: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.newsAPIClient.interceptors.response.use(
      (response) => {
        this.logger.debug(`✅ NewsAPI response: ${response.status}, articles: ${response.data?.articles?.length || 0}`);
        return response;
      },
      (error) => {
        this.logger.error('❌ NewsAPI error:', {
          status: error.response?.status,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );

    // CryptoPanic interceptors
    this.cryptoPanicClient.interceptors.request.use(
      (config) => {
        this.logger.debug(`🚨 CryptoPanic call: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.cryptoPanicClient.interceptors.response.use(
      (response) => {
        this.logger.debug(`✅ CryptoPanic response: ${response.status}, results: ${response.data?.results?.length || 0}`);
        return response;
      },
      (error) => {
        this.logger.error('❌ CryptoPanic error:', {
          status: error.response?.status,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get real financial news from NewsAPI
   */
  async getFinancialNews(symbols: string[], hours: number = 24, limit: number = 50): Promise<NewsArticle[]> {
    try {
      const query = this.buildFinancialQuery(symbols);
      const fromDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      this.logger.info(`📰 Fetching REAL financial news for ${symbols.join(', ')} from last ${hours} hours`);

      const response = await this.newsAPIClient.get<NewsAPIResponse>('/everything', {
        params: {
          q: query,
          from: fromDate,
          sortBy: 'publishedAt',
          language: 'en',
          pageSize: Math.min(limit, 100),
          domains: 'reuters.com,bloomberg.com,cnbc.com,marketwatch.com,yahoo.com,wsj.com,ft.com,businessinsider.com'
        }
      });

      if (response.data.status !== 'ok') {
        throw new Error(`NewsAPI error: ${response.data.status}`);
      }

      const articles = response.data.articles
        .filter(article => article.title && article.description && !article.title.includes('[Removed]'))
        .map((article, index) => this.transformNewsAPIArticle(article, symbols, index))
        .slice(0, limit);

      this.logger.info(`✅ Retrieved ${articles.length} REAL financial news articles`);
      this.logTopHeadlines(articles, 'Financial');

      return articles;
    } catch (error) {
      this.logger.error('❌ Failed to fetch real financial news:', error);
      throw new Error('NewsAPI financial news failed');
    }
  }

  /**
   * Get real crypto news from NewsAPI
   */
  async getCryptoNews(symbols: string[], hours: number = 24, limit: number = 30): Promise<NewsArticle[]> {
    try {
      const query = this.buildCryptoQuery(symbols);
      const fromDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      this.logger.info(`🪙 Fetching REAL crypto news for ${symbols.join(', ')} from last ${hours} hours`);

      const response = await this.newsAPIClient.get<NewsAPIResponse>('/everything', {
        params: {
          q: query,
          from: fromDate,
          sortBy: 'publishedAt',
          language: 'en',
          pageSize: Math.min(limit, 100),
          domains: 'coindesk.com,cointelegraph.com,decrypt.co,bitcoinmagazine.com,theblock.co,cryptoslate.com,ccn.com'
        }
      });

      if (response.data.status !== 'ok') {
        throw new Error(`NewsAPI crypto error: ${response.data.status}`);
      }

      const articles = response.data.articles
        .filter(article => article.title && article.description && !article.title.includes('[Removed]'))
        .map((article, index) => this.transformNewsAPIArticle(article, symbols, index, 'crypto'))
        .slice(0, limit);

      this.logger.info(`✅ Retrieved ${articles.length} REAL crypto news articles`);
      this.logTopHeadlines(articles, 'Crypto');

      return articles;
    } catch (error) {
      this.logger.error('❌ Failed to fetch real crypto news:', error);
      throw new Error('NewsAPI crypto news failed');
    }
  }

  /**
   * Get real crypto news from CryptoPanic
   */
  async getCryptoPanicNews(symbols: string[], limit: number = 25): Promise<NewsArticle[]> {
    try {
      this.logger.info(`🚨 Fetching REAL CryptoPanic news for ${symbols.join(', ')}`);

      const currencies = symbols.map(s => s.toLowerCase()).join(',');
      const response = await this.cryptoPanicClient.get<CryptoPanicResponse>('/posts/', {
        params: {
          currencies: currencies,
          filter: 'hot',
          public: 'true',
          limit: Math.min(limit, 100)
        }
      });

      const articles = response.data.results
        .filter(post => post.title && post.url)
        .map((post, index) => this.transformCryptoPanicPost(post, symbols, index))
        .slice(0, limit);

      this.logger.info(`✅ Retrieved ${articles.length} REAL CryptoPanic articles`);
      this.logTopHeadlines(articles, 'CryptoPanic');

      return articles;
    } catch (error) {
      this.logger.error('❌ Failed to fetch real CryptoPanic news:', error);
      throw new Error('CryptoPanic API failed');
    }
  }

  /**
   * Get aggregated real news from all sources
   */
  async getAggregatedNews(symbols: string[], hours: number = 24): Promise<NewsArticle[]> {
    this.logger.info(`📊 Aggregating REAL news from all sources for ${symbols.join(', ')}`);

    const newsPromises = [
      this.getFinancialNews(symbols, hours, 30),
      this.getCryptoNews(symbols, hours, 20),
      this.getCryptoPanicNews(symbols, 15)
    ];

    try {
      const [financialNews, cryptoNews, cryptoPanicNews] = await Promise.allSettled(newsPromises);

      const allNews: NewsArticle[] = [];

      if (financialNews && financialNews.status === 'fulfilled') {
        allNews.push(...financialNews.value);
      } else if (financialNews && financialNews.status === 'rejected') {
        this.logger.warn('⚠️ Financial news failed:', financialNews.reason);
      }

      if (cryptoNews && cryptoNews.status === 'fulfilled') {
        allNews.push(...cryptoNews.value);
      } else if (cryptoNews && cryptoNews.status === 'rejected') {
        this.logger.warn('⚠️ Crypto news failed:', cryptoNews.reason);
      }

      if (cryptoPanicNews && cryptoPanicNews.status === 'fulfilled') {
        allNews.push(...cryptoPanicNews.value);
      } else if (cryptoPanicNews && cryptoPanicNews.status === 'rejected') {
        this.logger.warn('⚠️ CryptoPanic news failed:', cryptoPanicNews.reason);
      }

      // Remove duplicates and sort by timestamp
      const uniqueNews = this.deduplicateNews(allNews);
      const sortedNews = uniqueNews.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      this.logger.info(`✅ Aggregated ${sortedNews.length} unique REAL news articles`);
      return sortedNews;
    } catch (error) {
      this.logger.error('❌ Failed to aggregate real news:', error);
      throw new Error('News aggregation failed');
    }
  }

  private transformNewsAPIArticle(article: any, symbols: string[], index: number, category: 'crypto' | 'stock' | 'general' = 'general'): NewsArticle {
    return {
      id: `newsapi_${Date.now()}_${index}`,
      title: article.title,
      content: article.description || article.content || '',
      source: article.source.name,
      url: article.url,
      timestamp: article.publishedAt,
      sentiment_score: this.calculateSentiment(article.title, article.description),
      relevance_score: this.calculateRelevance(article.title, article.description, symbols),
      category,
      symbols: this.extractSymbolsFromText(article.title + ' ' + (article.description || ''), symbols)
    };
  }

  private transformCryptoPanicPost(post: any, symbols: string[], _index: number): NewsArticle {
    return {
      id: `cryptopanic_${post.id}`,
      title: post.title,
      content: post.title, // CryptoPanic doesn't provide full content
      source: post.source.title,
      url: post.url,
      timestamp: post.published_at,
      sentiment_score: this.calculateCryptoPanicSentiment(post),
      relevance_score: this.calculateCryptoPanicRelevance(post, symbols),
      category: 'crypto',
      symbols: post.currencies.map((c: any) => c.code.toUpperCase())
    };
  }

  private calculateSentiment(title: string, description: string | null): number {
    const text = `${title} ${description || ''}`.toLowerCase();

    const positiveWords = [
      'gain', 'gains', 'rise', 'rises', 'up', 'surge', 'surges', 'rally', 'rallies', 'bull', 'bullish',
      'green', 'profit', 'profits', 'boom', 'breakthrough', 'success', 'positive', 'optimistic',
      'strong', 'strength', 'growth', 'growing', 'increase', 'increases', 'record', 'high', 'highs',
      'moon', 'pump', 'pumping', 'buy', 'buying', 'accumulate', 'hodl'
    ];

    const negativeWords = [
      'fall', 'falls', 'drop', 'drops', 'down', 'crash', 'crashes', 'bear', 'bearish', 'red',
      'loss', 'losses', 'decline', 'declines', 'negative', 'pessimistic', 'weak', 'weakness',
      'concern', 'concerns', 'worry', 'worries', 'fear', 'fears', 'risk', 'risks', 'low', 'lows',
      'dump', 'dumping', 'sell', 'selling', 'correction', 'bubble', 'regulation', 'ban'
    ];

    let sentiment = 0;
    let matches = 0;

    positiveWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matchCount = (text.match(regex) || []).length;
      if (matchCount > 0) {
        sentiment += matchCount * 0.1;
        matches += matchCount;
      }
    });

    negativeWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matchCount = (text.match(regex) || []).length;
      if (matchCount > 0) {
        sentiment -= matchCount * 0.1;
        matches += matchCount;
      }
    });

    // Normalize sentiment
    if (matches > 0) {
      sentiment = sentiment / Math.sqrt(matches); // Dampen effect of multiple keywords
    }

    return Math.max(-1, Math.min(1, sentiment));
  }

  private calculateCryptoPanicSentiment(post: any): number {
    const votes = post.votes;
    const totalVotes = votes.positive + votes.negative + votes.important + votes.liked + votes.disliked;

    if (totalVotes === 0) return 0;

    const positiveScore = (votes.positive + votes.liked + votes.important) / totalVotes;
    const negativeScore = (votes.negative + votes.disliked + votes.toxic) / totalVotes;

    return positiveScore - negativeScore;
  }

  private calculateRelevance(title: string, description: string | null, symbols: string[]): number {
    const text = `${title} ${description || ''}`.toLowerCase();
    let relevance = 0.5; // Base relevance

    // Check for exact symbol matches
    symbols.forEach(symbol => {
      const symbolLower = symbol.toLowerCase();
      const regex = new RegExp(`\\b${symbolLower}\\b`, 'gi');
      if (text.match(regex)) {
        relevance += 0.3;
      }
    });

    // Check for crypto/financial keywords
    const financialKeywords = ['bitcoin', 'ethereum', 'crypto', 'cryptocurrency', 'blockchain', 'defi', 'nft',
                             'trading', 'market', 'price', 'investment', 'finance', 'stock', 'economy'];

    financialKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        relevance += 0.1;
      }
    });

    return Math.min(1, relevance);
  }

  private calculateCryptoPanicRelevance(post: any, symbols: string[]): number {
    let relevance = 0.7; // Base relevance for CryptoPanic (crypto-specific)

    // Check if post mentions our symbols
    const postCurrencies = post.currencies.map((c: any) => c.code.toUpperCase());
    symbols.forEach(symbol => {
      if (postCurrencies.includes(symbol.toUpperCase())) {
        relevance += 0.3;
      }
    });

    // Boost relevance based on votes
    const votes = post.votes;
    const totalVotes = votes.positive + votes.negative + votes.important + votes.liked + votes.disliked;
    if (totalVotes > 10) relevance += 0.2;

    return Math.min(1, relevance);
  }

  private extractSymbolsFromText(text: string, symbols: string[]): string[] {
    const extractedSymbols: string[] = [];
    symbols.forEach(symbol => {
      const regex = new RegExp(`\\b${symbol}\\b`, 'gi');
      if (text.match(regex)) {
        extractedSymbols.push(symbol.toUpperCase());
      }
    });
    return extractedSymbols;
  }

  private buildFinancialQuery(symbols: string[]): string {
    const baseTerms = ['market', 'trading', 'investment', 'finance', 'economy', 'stock', 'price'];
    const symbolTerms: string[] = [];

    symbols.forEach(symbol => {
      const terms = this.getFinancialTerms(symbol);
      symbolTerms.push(...terms);
    });

    const allTerms = [...new Set([...baseTerms, ...symbolTerms])];
    return allTerms.slice(0, 15).join(' OR ');
  }

  private buildCryptoQuery(symbols: string[]): string {
    const baseTerms = ['bitcoin', 'ethereum', 'cryptocurrency', 'crypto', 'blockchain', 'defi'];
    const symbolTerms: string[] = [];

    symbols.forEach(symbol => {
      const terms = this.getCryptoTerms(symbol);
      symbolTerms.push(...terms);
    });

    const allTerms = [...new Set([...baseTerms, ...symbolTerms])];
    return allTerms.slice(0, 15).join(' OR ');
  }

  private getFinancialTerms(symbol: string): string[] {
    const termMap: Record<string, string[]> = {
      'BTC': ['Bitcoin', 'BTC', 'cryptocurrency'],
      'ETH': ['Ethereum', 'ETH', 'Ether'],
      'AAPL': ['Apple', 'AAPL', 'iPhone'],
      'TSLA': ['Tesla', 'TSLA', 'electric vehicle', 'EV'],
      'NVDA': ['NVIDIA', 'NVDA', 'AI chip', 'GPU'],
      'GOOGL': ['Google', 'Alphabet', 'GOOGL'],
      'MSFT': ['Microsoft', 'MSFT', 'Azure'],
      'AMZN': ['Amazon', 'AMZN', 'AWS']
    };
    return termMap[symbol.toUpperCase()] || [symbol];
  }

  private getCryptoTerms(symbol: string): string[] {
    const termMap: Record<string, string[]> = {
      'BTC': ['Bitcoin', 'BTC'],
      'ETH': ['Ethereum', 'ETH', 'Ether'],
      'BNB': ['Binance', 'BNB'],
      'XRP': ['Ripple', 'XRP'],
      'SOL': ['Solana', 'SOL'],
      'ADA': ['Cardano', 'ADA'],
      'DOGE': ['Dogecoin', 'DOGE'],
      'AVAX': ['Avalanche', 'AVAX'],
      'DOT': ['Polkadot', 'DOT']
    };
    return termMap[symbol.toUpperCase()] || [symbol];
  }

  private deduplicateNews(articles: NewsArticle[]): NewsArticle[] {
    const seen = new Set<string>();
    return articles.filter(article => {
      const key = article.title.toLowerCase().replace(/[^\w\s]/g, '').slice(0, 50);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private logTopHeadlines(articles: NewsArticle[], source: string): void {
    const topHeadlines = articles.slice(0, 3).map(a => a.title);
    if (topHeadlines.length > 0) {
      this.logger.info(`📰 Top ${source} headlines:`, topHeadlines);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Test NewsAPI
      await this.newsAPIClient.get('/top-headlines', {
        params: { country: 'us', pageSize: 1 }
      });

      // Test CryptoPanic
      await this.cryptoPanicClient.get('/posts/', {
        params: { public: 'true', limit: 1 }
      });

      this.logger.info('✅ News service health check passed');
      return true;
    } catch (error) {
      this.logger.error('❌ News service health check failed:', error);
      return false;
    }
  }
}