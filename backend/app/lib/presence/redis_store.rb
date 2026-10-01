module Presence
  # One sorted set per user: member = connection id, score = when that entry expires.
  class RedisStore
    def initialize(url)
      @redis = Redis.new(url: url)
    end

    # Returns how many live connections the user has afterwards.
    def add(user_id, connection_id, expires_at)
      key = key_for(user_id)
      @redis.multi do |tx|
        tx.zadd(key, expires_at.to_f, connection_id)
        tx.expire(key, TTL.to_i)
        tx.zcount(key, Time.current.to_f, "+inf")
      end.last
    end

    # Returns how many live connections the user has left.
    def remove(user_id, connection_id)
      key = key_for(user_id)
      @redis.multi do |tx|
        tx.zrem(key, connection_id)
        tx.zcount(key, Time.current.to_f, "+inf")
      end.last
    end

    def online_ids(user_ids)
      now = Time.current.to_f
      counts = @redis.pipelined { |pipe| user_ids.each { |id| pipe.zcount(key_for(id), now, "+inf") } }
      user_ids.zip(counts).select { |_id, count| count.positive? }.map(&:first)
    end

    private

    def key_for(user_id)
      "presence:user:#{user_id}"
    end
  end
end
