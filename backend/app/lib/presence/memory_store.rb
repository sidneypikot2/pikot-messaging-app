module Presence
  # Same interface as RedisStore, held in this process — only used in test.
  class MemoryStore
    def initialize
      @expiries = Hash.new { |hash, user_id| hash[user_id] = {} }
      @away = Hash.new { |hash, user_id| hash[user_id] = Set.new }
      @lock = Mutex.new
    end

    def add(user_id, connection_id, expires_at)
      @lock.synchronize { @expiries[user_id][connection_id] = expires_at }
    end

    def remove(user_id, connection_id)
      @lock.synchronize do
        @expiries[user_id].delete(connection_id)
        @away[user_id].delete(connection_id)
      end
    end

    def set_away(user_id, connection_id, away)
      @lock.synchronize { away ? @away[user_id].add(connection_id) : @away[user_id].delete(connection_id) }
    end

    def connections(user_ids)
      now = Time.current
      @lock.synchronize do
        user_ids.to_h do |id|
          live = @expiries[id].select { |_connection_id, expires_at| expires_at > now }.keys
          [ id, [ live.size, (live - @away[id].to_a).size ] ]
        end
      end
    end

    def clear
      @lock.synchronize do
        @expiries.clear
        @away.clear
      end
    end
  end
end
