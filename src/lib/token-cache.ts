/**
 * Server-side token cache to avoid storing large access tokens in cookies
 * Uses in-memory storage with optional persistence to SQLite
 */

import Database from 'better-sqlite3';
import path from 'path';

// Database file path
const DB_PATH = path.join(process.cwd(), 'usage.db');

function getDb(): Database.Database {
  return new Database(DB_PATH);
}

interface TokenData {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpires: number;
  error?: string;
}

interface CacheEntry {
  data: TokenData;
  expiresAt: number;
}

class TokenCache {
  private cache = new Map<string, CacheEntry>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Initialize cleanup job - remove expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Store token data for a user session
   */
  set(sessionId: string, tokenData: TokenData): void {
    // Cache expires 1 hour after token expiration
    const expiresAt = tokenData.accessTokenExpires + 60 * 60 * 1000;
    
    this.cache.set(sessionId, {
      data: tokenData,
      expiresAt,
    });

    // Optionally persist to database for durability across restarts
    this.persistToDb(sessionId, tokenData, expiresAt);
  }

  /**
   * Retrieve token data for a user session
   */
  get(sessionId: string): TokenData | null {
    // Try in-memory cache first
    const entry = this.cache.get(sessionId);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.data;
    }

    // If not in memory, try database
    return this.getFromDb(sessionId);
  }

  /**
   * Remove token data for a session
   */
  delete(sessionId: string): void {
    this.cache.delete(sessionId);
    this.deleteFromDb(sessionId);
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [sessionId, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(sessionId);
      }
    }
    
    // Also cleanup expired entries from database
    this.cleanupDb();
  }

  /**
   * Persist token to database
   */
  private persistToDb(sessionId: string, tokenData: TokenData, expiresAt: number): void {
    const db = getDb();
    try {
      db.prepare(
        `INSERT OR REPLACE INTO token_cache (session_id, token_data, expires_at)
         VALUES (?, ?, ?)`
      ).run(sessionId, JSON.stringify(tokenData), Math.floor(expiresAt / 1000));
    } catch (error) {
      console.error("Failed to persist token to database:", error);
      // Non-critical - continue with in-memory cache
    } finally {
      db.close();
    }
  }

  /**
   * Retrieve token from database
   */
  private getFromDb(sessionId: string): TokenData | null {
    const db = getDb();
    try {
      const row = db.prepare(
        `SELECT token_data, expires_at FROM token_cache 
         WHERE session_id = ? AND expires_at > ?`
      ).get(sessionId, Math.floor(Date.now() / 1000)) as { token_data: string; expires_at: number } | undefined;

      if (row) {
        const tokenData = JSON.parse(row.token_data) as TokenData;
        // Restore to in-memory cache
        this.cache.set(sessionId, {
          data: tokenData,
          expiresAt: row.expires_at * 1000,
        });
        return tokenData;
      }
    } catch (error) {
      console.error("Failed to retrieve token from database:", error);
    } finally {
      db.close();
    }
    return null;
  }

  /**
   * Delete token from database
   */
  private deleteFromDb(sessionId: string): void {
    const db = getDb();
    try {
      db.prepare(`DELETE FROM token_cache WHERE session_id = ?`).run(sessionId);
    } catch (error) {
      console.error("Failed to delete token from database:", error);
    } finally {
      db.close();
    }
  }

  /**
   * Clean up expired tokens from database
   */
  private cleanupDb(): void {
    const db = getDb();
    try {
      db.prepare(`DELETE FROM token_cache WHERE expires_at <= ?`)
        .run(Math.floor(Date.now() / 1000));
    } catch (error) {
      console.error("Failed to cleanup database:", error);
    } finally {
      db.close();
    }
  }

  /**
   * Destroy cache and cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

// Initialize database table
try {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS token_cache (
      session_id TEXT PRIMARY KEY,
      token_data TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_token_cache_expires ON token_cache(expires_at)`);
  db.close();
} catch (error) {
  console.error("Failed to initialize token_cache table:", error);
}

// Singleton instance
export const tokenCache = new TokenCache();

// Cleanup on process exit
if (typeof process !== "undefined") {
  process.on("beforeExit", () => tokenCache.destroy());
}
