module Presence
  # Per user: a sorted set of their connections (score = when that entry expires), and a
  # set of the connections that are currently away.
  class RedisStore
    def initialize(url)
      @redis = Redis.new(url: url)
    end

    def add(user_id, connection_id, expires_at)
      key = live_key(user_id)
      @redis.multi do |tx|
        tx.zadd(key, expires_at.to_f, connection_id)
        tx.expire(key, TTL.to_i)
        tx.expire(away_key(user_id), TTL.to_i)
      end
    end

    def remove(user_id, connection_id)
      @redis.multi do |tx|
        tx.zrem(live_key(user_id), connection_id)
        tx.srem(away_key(user_id), connection_id)
      end
    end

    def set_away(user_id, connection_id, away)
      key = away_key(user_id)
      @redis.multi do |tx|
        away ? tx.sadd(key, connection_id) : tx.srem(key, connection_id)
        tx.expire(key, TTL.to_i)
      end
    end

    # { user_id => [live connections, live connections that aren't away] }
    def connections(user_ids)
      now = Time.current.to_f
      replies = @redis.pipelined do |pipe|
        user_ids.each do |id|
          pipe.zrangebyscore(live_key(id), now, "+inf")
          pipe.smembers(away_key(id))
        end
      end
      user_ids.zip(replies.each_slice(2)).to_h do |id, (live, away)|
        [ id, [ live.size, (live - away).size ] ]
      end
    end

    private

    def live_key(user_id)
      "presence:user:#{user_id}"
    end

    def away_key(user_id)
      "presence:away:#{user_id}"
    end
  end
end
