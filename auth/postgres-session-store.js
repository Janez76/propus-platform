function createPostgresSessionStore(Store, options = {}) {
  class PostgresSessionStore extends Store {
    constructor(storeOptions = {}) {
      super();
      const {
        pool,
        tableName,
        cleanupIntervalMs = 15 * 60 * 1000,
        ttlSeconds = 24 * 60 * 60,
        logger = console,
      } = storeOptions;

      if (!pool) throw new Error("PostgresSessionStore requires a pg pool");
      if (!tableName) throw new Error("PostgresSessionStore requires a tableName");

      this.pool = pool;
      this.tableName = tableName;
      this.ttlSeconds = ttlSeconds;
      this.logger = logger;
      this.readyPromise = this.ensureTable();

      if (cleanupIntervalMs > 0) {
        this.cleanupTimer = setInterval(() => {
          this.cleanupExpired().catch((err) => {
            this.logger.warn?.("[session-store] cleanup failed", err.message || err);
          });
        }, cleanupIntervalMs);
        this.cleanupTimer.unref?.();
      }
    }

    async ensureTable() {
      const [schema, rawTable] = this.tableName.includes(".")
        ? this.tableName.split(".", 2)
        : ["public", this.tableName];

      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema) || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(rawTable)) {
        throw new Error(`Invalid session table name: ${this.tableName}`);
      }

      try {
        await this.pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
      } catch (err) {
        // 23505 = unique_violation: race condition when two connections try to
        // CREATE SCHEMA simultaneously on a fresh database — safe to ignore.
        if (err.code !== '23505') throw err;
      }
      await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.${rawTable} (
        sid TEXT PRIMARY KEY,
        sess JSONB NOT NULL,
        expire TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
      await this.pool.query(`
      CREATE INDEX IF NOT EXISTS ${rawTable}_expire_idx
      ON ${schema}.${rawTable} (expire)
    `);
    }

    async cleanupExpired() {
      await this.readyPromise;
      await this.pool.query(`DELETE FROM ${this.tableName} WHERE expire < NOW()`);
    }

    getExpiry(sess) {
      const expires = sess?.cookie?.expires;
      if (expires) return new Date(expires);

      const maxAge = Number(sess?.cookie?.maxAge);
      if (Number.isFinite(maxAge) && maxAge > 0) return new Date(Date.now() + maxAge);

      return new Date(Date.now() + this.ttlSeconds * 1000);
    }

    withCallback(promise, callback, transform = (value) => value) {
      promise
        .then((value) => callback?.(null, transform(value)))
        .catch((err) => callback?.(err));
    }

    get(sid, callback) {
      this.withCallback(
        (async () => {
          await this.readyPromise;
          const { rows } = await this.pool.query(
            `SELECT sess FROM ${this.tableName} WHERE sid = $1 AND expire >= NOW()`,
            [sid]
          );
          return rows[0]?.sess || null;
        })(),
        callback
      );
    }

    set(sid, sess, callback) {
      this.withCallback(
        (async () => {
          await this.readyPromise;
          const expire = this.getExpiry(sess);
          await this.pool.query(
            `
            INSERT INTO ${this.tableName} (sid, sess, expire, updated_at)
            VALUES ($1, $2::jsonb, $3, NOW())
            ON CONFLICT (sid) DO UPDATE
              SET sess = EXCLUDED.sess,
                  expire = EXCLUDED.expire,
                  updated_at = NOW()
          `,
            [sid, JSON.stringify(sess), expire]
          );
        })(),
        callback
      );
    }

    touch(sid, sess, callback) {
      this.withCallback(
        (async () => {
          await this.readyPromise;
          const expire = this.getExpiry(sess);
          await this.pool.query(
            `
            UPDATE ${this.tableName}
            SET sess = $2::jsonb,
                expire = $3,
                updated_at = NOW()
            WHERE sid = $1
          `,
            [sid, JSON.stringify(sess), expire]
          );
        })(),
        callback
      );
    }

    destroy(sid, callback) {
      this.withCallback(
        (async () => {
          await this.readyPromise;
          await this.pool.query(`DELETE FROM ${this.tableName} WHERE sid = $1`, [sid]);
        })(),
        callback
      );
    }
  }

  return new PostgresSessionStore(options);
}

module.exports = { createPostgresSessionStore };
