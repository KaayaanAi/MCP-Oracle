import axios, { AxiosInstance } from 'axios';
import type { SentimentData } from '../types/index.js';
import { loggers } from '../utils/logger.js';

// Make snoowrap optional - will be loaded dynamically
let Snoowrap: any;

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  author: string;
  created_utc: number;
  score: number;
  num_comments: number;
  upvote_ratio: number;
  url: string;
  subreddit: string;
  permalink: string;
}

export class RedditService {
  private reddit?: any;
  private client: AxiosInstance;
  private clientId?: string;
  private clientSecret?: string;
  private userAgent: string;
  private logger = loggers.reddit;

  constructor(clientId?: string, clientSecret?: string, userAgent = 'MCP-Oracle:v1.0.0') {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.userAgent = userAgent;

    // Fallback to public Reddit API if no credentials
    this.client = axios.create({
      baseURL: 'https://www.reddit.com',
      timeout: 15000,
      headers: {
        'User-Agent': userAgent
      }
    });

    this.setupRequestInterceptor();
  }

  private async setupAuthentication(): Promise<void> {
    if (this.clientId && this.clientSecret) {
      // Try to load Snoowrap dynamically
      if (!Snoowrap) {
        try {
          const snoowrap = await import('snoowrap');
          Snoowrap = snoowrap.default;
        } catch (error) {
          this.logger.warn('Snoowrap not available, using public Reddit API only', { error });
          return;
        }
      }

      try {
        this.reddit = new Snoowrap({
          userAgent: this.userAgent,
          clientId: this.clientId,
          clientSecret: this.clientSecret,
          grantType: 'client_credentials'
        });
        this.logger.info('Reddit authenticated API initialized');
      } catch (error) {
        this.logger.warn('Reddit authentication failed, using public API');
      }
    }
  }

  private setupRequestInterceptor(): void {
    this.client.interceptors.request.use(
      (config) => {
        this.logger.debug(`Reddit API call: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logger.error('Reddit API error:', {
          status: error.response?.status,
          data: error.response?.data
        });
        if (error.response?.status === 429) {
          this.logger.warn('Reddit rate limit hit');
        }
        return Promise.reject(error);
      }
    );
  }

  async getCryptocurrencyPosts(limit = 25): Promise<RedditPost[]> {
    try {
      // Ensure authentication is set up
      if (!this.reddit && this.clientId && this.clientSecret) {
        await this.setupAuthentication();
      }

      if (this.reddit) {
        // Use authenticated API
        const subreddit = await this.reddit.getSubreddit('cryptocurrency');
        const posts = await subreddit.getHot({ limit });

        return posts.map((post: any) => ({
          id: post.id,
          title: post.title,
          selftext: post.selftext,
          author: post.author.name,
          created_utc: post.created_utc,
          score: post.score,
          num_comments: post.num_comments,
          upvote_ratio: post.upvote_ratio,
          url: post.url,
          subreddit: post.subreddit.display_name,
          permalink: post.permalink
        }));
      } else {
        // Use public API
        const response = await this.client.get('/r/cryptocurrency/hot.json', {
          params: { limit }
        });

        return response.data.data.children.map((child: any) => {
          const post = child.data;
          return {
            id: post.id,
            title: post.title,
            selftext: post.selftext,
            author: post.author,
            created_utc: post.created_utc,
            score: post.score,
            num_comments: post.num_comments,
            upvote_ratio: post.upvote_ratio,
            url: post.url,
            subreddit: post.subreddit,
            permalink: post.permalink
          };
        });
      }
    } catch (error) {
      this.logger.error('Failed to fetch cryptocurrency posts:', error);
      throw new Error('Reddit cryptocurrency posts error');
    }
  }

  async getBitcoinPosts(limit = 20): Promise<RedditPost[]> {
    try {
      // Ensure authentication is set up
      if (!this.reddit && this.clientId && this.clientSecret) {
        await this.setupAuthentication();
      }

      if (this.reddit) {
        const subreddit = await this.reddit.getSubreddit('Bitcoin');
        const posts = await subreddit.getHot({ limit });

        return posts.map((post: any) => ({
          id: post.id,
          title: post.title,
          selftext: post.selftext,
          author: post.author.name,
          created_utc: post.created_utc,
          score: post.score,
          num_comments: post.num_comments,
          upvote_ratio: post.upvote_ratio,
          url: post.url,
          subreddit: post.subreddit.display_name,
          permalink: post.permalink
        }));
      } else {
        const response = await this.client.get('/r/Bitcoin/hot.json', {
          params: { limit }
        });

        return response.data.data.children.map((child: any) => {
          const post = child.data;
          return {
            id: post.id,
            title: post.title,
            selftext: post.selftext,
            author: post.author,
            created_utc: post.created_utc,
            score: post.score,
            num_comments: post.num_comments,
            upvote_ratio: post.upvote_ratio,
            url: post.url,
            subreddit: post.subreddit,
            permalink: post.permalink
          };
        });
      }
    } catch (error) {
      this.logger.error('Failed to fetch Bitcoin posts:', error);
      throw new Error('Reddit Bitcoin posts error');
    }
  }

  async getStocksPosts(limit = 20): Promise<RedditPost[]> {
    try {
      // Ensure authentication is set up
      if (!this.reddit && this.clientId && this.clientSecret) {
        await this.setupAuthentication();
      }

      const subreddits = ['stocks', 'investing', 'SecurityAnalysis'];
      const allPosts: RedditPost[] = [];

      for (const subredditName of subreddits) {
        try {
          if (this.reddit) {
            const subreddit = await this.reddit.getSubreddit(subredditName);
            const posts = await subreddit.getHot({ limit: Math.ceil(limit / subreddits.length) });

            const formattedPosts = posts.map((post: any) => ({
              id: post.id,
              title: post.title,
              selftext: post.selftext,
              author: post.author.name,
              created_utc: post.created_utc,
              score: post.score,
              num_comments: post.num_comments,
              upvote_ratio: post.upvote_ratio,
              url: post.url,
              subreddit: post.subreddit.display_name,
              permalink: post.permalink
            }));
            allPosts.push(...formattedPosts);
          } else {
            const response = await this.client.get(`/r/${subredditName}/hot.json`, {
              params: { limit: Math.ceil(limit / subreddits.length) }
            });

            const posts = response.data.data.children.map((child: any) => {
              const post = child.data;
              return {
                id: post.id,
                title: post.title,
                selftext: post.selftext,
                author: post.author,
                created_utc: post.created_utc,
                score: post.score,
                num_comments: post.num_comments,
                upvote_ratio: post.upvote_ratio,
                url: post.url,
                subreddit: post.subreddit,
                permalink: post.permalink
              };
            });
            allPosts.push(...posts);
          }
        } catch (error) {
          this.logger.warn(`Failed to fetch from r/${subredditName}:`, error);
        }
      }

      return allPosts.slice(0, limit);
    } catch (error) {
      this.logger.error('Failed to fetch stocks posts:', error);
      throw new Error('Reddit stocks posts error');
    }
  }

  async searchPosts(query: string, subreddits: string[] = ['cryptocurrency', 'Bitcoin'], limit = 15): Promise<RedditPost[]> {
    try {
      // Ensure authentication is set up
      if (!this.reddit && this.clientId && this.clientSecret) {
        await this.setupAuthentication();
      }

      const allPosts: RedditPost[] = [];

      for (const subredditName of subreddits) {
        try {
          if (this.reddit) {
            const subreddit = await this.reddit.getSubreddit(subredditName);
            const posts = await subreddit.search({
              query,
              time: 'week',
              sort: 'relevance',
              limit: Math.ceil(limit / subreddits.length)
            });

            const formattedPosts = posts.map((post: any) => ({
              id: post.id,
              title: post.title,
              selftext: post.selftext,
              author: post.author.name,
              created_utc: post.created_utc,
              score: post.score,
              num_comments: post.num_comments,
              upvote_ratio: post.upvote_ratio,
              url: post.url,
              subreddit: post.subreddit.display_name,
              permalink: post.permalink
            }));
            allPosts.push(...formattedPosts);
          } else {
            const response = await this.client.get(`/r/${subredditName}/search.json`, {
              params: {
                q: query,
                restrict_sr: 'on',
                sort: 'relevance',
                t: 'week',
                limit: Math.ceil(limit / subreddits.length)
              }
            });

            const posts = response.data.data.children.map((child: any) => {
              const post = child.data;
              return {
                id: post.id,
                title: post.title,
                selftext: post.selftext,
                author: post.author,
                created_utc: post.created_utc,
                score: post.score,
                num_comments: post.num_comments,
                upvote_ratio: post.upvote_ratio,
                url: post.url,
                subreddit: post.subreddit,
                permalink: post.permalink
              };
            });
            allPosts.push(...posts);
          }
        } catch (error) {
          this.logger.warn(`Failed to search in r/${subredditName}:`, error);
        }
      }

      return allPosts.slice(0, limit);
    } catch (error) {
      this.logger.error(`Failed to search Reddit for "${query}":`, error);
      throw new Error('Reddit search error');
    }
  }

  async getSentimentAnalysis(symbols: string[]): Promise<SentimentData[]> {
    try {
      const sentimentData: SentimentData[] = [];

      for (const symbol of symbols) {
        // Search for posts mentioning the symbol
        const posts = await this.searchPosts(symbol, ['cryptocurrency', 'Bitcoin', 'ethtrader'], 20);

        if (posts.length === 0) {
          sentimentData.push({
            source: 'reddit',
            symbol,
            sentiment_score: 0,
            volume: 0,
            timestamp: new Date().toISOString()
          });
          continue;
        }

        let totalSentiment = 0;
        let totalVolume = 0;

        posts.forEach(post => {
          const sentiment = this.calculatePostSentiment(post);
          const weight = this.calculatePostWeight(post);

          totalSentiment += sentiment * weight;
          totalVolume += weight;
        });

        const avgSentiment = totalVolume > 0 ? totalSentiment / totalVolume : 0;

        sentimentData.push({
          source: 'reddit',
          symbol,
          sentiment_score: avgSentiment,
          volume: posts.length,
          timestamp: new Date().toISOString()
        });
      }

      return sentimentData;
    } catch (error) {
      this.logger.error('Failed to get sentiment analysis:', error);
      throw new Error('Reddit sentiment analysis error');
    }
  }

  private calculatePostSentiment(post: RedditPost): number {
    const text = `${post.title} ${post.selftext}`.toLowerCase();

    // Sentiment word lists
    const bullishWords = ['bullish', 'moon', 'pump', 'gains', 'rise', 'surge', 'rally', 'breakout', 'buy', 'hold', 'hodl', 'diamond hands', 'to the moon', 'rocket', 'green', 'up', 'positive', 'optimistic'];
    const bearishWords = ['bearish', 'dump', 'crash', 'fall', 'drop', 'decline', 'sell', 'bear', 'red', 'down', 'negative', 'pessimistic', 'worried', 'concern', 'fear'];

    let sentiment = 0;

    // Count sentiment words
    bullishWords.forEach(word => {
      const matches = (text.match(new RegExp(word, 'g')) || []).length;
      sentiment += matches * 0.1;
    });

    bearishWords.forEach(word => {
      const matches = (text.match(new RegExp(word, 'g')) || []).length;
      sentiment -= matches * 0.1;
    });

    // Factor in upvote ratio
    if (post.upvote_ratio > 0.7) {
      sentiment += 0.1;
    } else if (post.upvote_ratio < 0.5) {
      sentiment -= 0.1;
    }

    // Factor in score
    if (post.score > 100) {
      sentiment += 0.05;
    } else if (post.score < 0) {
      sentiment -= 0.15;
    }

    return Math.max(-1, Math.min(1, sentiment));
  }

  private calculatePostWeight(post: RedditPost): number {
    let weight = 1;

    // Recent posts get higher weight
    const ageHours = (Date.now() / 1000 - post.created_utc) / 3600;
    if (ageHours < 24) {
      weight += 0.5;
    } else if (ageHours < 168) { // 1 week
      weight += 0.2;
    }

    // Popular posts get higher weight
    if (post.score > 1000) {
      weight += 0.8;
    } else if (post.score > 100) {
      weight += 0.4;
    } else if (post.score > 10) {
      weight += 0.2;
    }

    // High engagement posts get higher weight
    if (post.num_comments > 100) {
      weight += 0.3;
    } else if (post.num_comments > 20) {
      weight += 0.1;
    }

    // Good upvote ratio gets higher weight
    if (post.upvote_ratio > 0.8) {
      weight += 0.2;
    }

    return weight;
  }

  async getMarketSentimentSummary(): Promise<{
    crypto_sentiment: number;
    stocks_sentiment: number;
    bitcoin_sentiment: number;
    overall_sentiment: number;
    confidence: number;
  }> {
    try {
      const [cryptoPosts, stocksPosts, bitcoinPosts] = await Promise.all([
        this.getCryptocurrencyPosts(30),
        this.getStocksPosts(20),
        this.getBitcoinPosts(25)
      ]);

      const cryptoSentiment = this.calculateOverallSentiment(cryptoPosts);
      const stocksSentiment = this.calculateOverallSentiment(stocksPosts);
      const bitcoinSentiment = this.calculateOverallSentiment(bitcoinPosts);

      const overallSentiment = (cryptoSentiment + stocksSentiment + bitcoinSentiment) / 3;
      const totalPosts = cryptoPosts.length + stocksPosts.length + bitcoinPosts.length;
      const confidence = Math.min(1, totalPosts / 50); // Max confidence at 50+ posts

      return {
        crypto_sentiment: cryptoSentiment,
        stocks_sentiment: stocksSentiment,
        bitcoin_sentiment: bitcoinSentiment,
        overall_sentiment: overallSentiment,
        confidence
      };
    } catch (error) {
      this.logger.error('Failed to get market sentiment summary:', error);
      return {
        crypto_sentiment: 0,
        stocks_sentiment: 0,
        bitcoin_sentiment: 0,
        overall_sentiment: 0,
        confidence: 0
      };
    }
  }

  private calculateOverallSentiment(posts: RedditPost[]): number {
    if (posts.length === 0) return 0;

    let totalSentiment = 0;
    let totalWeight = 0;

    posts.forEach((post: RedditPost) => {
      const sentiment = this.calculatePostSentiment(post);
      const weight = this.calculatePostWeight(post);

      totalSentiment += sentiment * weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? totalSentiment / totalWeight : 0;
  }
}