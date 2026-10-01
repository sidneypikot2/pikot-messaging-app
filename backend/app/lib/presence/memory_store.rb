module Presence
  # Same interface as RedisStore, held in this process — only used in test.
  class MemoryStore
    def initialize
      @entries = Hash.new { |hash, user_id| hash[user_id] = {} }
      @lock = Mutex.new
    end

    def add(user_id, connection_id, expires_at)
      @lock.synchronize do
        @entries[user_id][connection_id] = expires_at
        live_count(user_id)
      end
    end

    def remove(user_id, connection_id)
      @lock.synchronize do
        @entries[user_id].delete(connection_id)
        live_count(user_id)
      end
    end

    def online_ids(user_ids)
      @lock.synchronize { user_ids.select { |id| live_count(id).positive? } }
    end

    def clear
      @lock.synchronize { @entries.clear }
    end

    private

    def live_count(user_id)
      now = Time.current
      @entries[user_id].count { |_connection_id, expires_at| expires_at > now }
    end
  end
end
