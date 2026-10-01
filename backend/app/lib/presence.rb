# Who's connected right now (KAN-39). Every open tab's NotificationsChannel subscription
# registers its own entry with an expiry that its heartbeat keeps pushing back, so:
# - several tabs count as one person (they're online while any entry is live), and
# - a server that dies without running `unsubscribed` can't leave anyone "online" for
#   longer than TTL — their entries just stop being refreshed and lapse.
module Presence
  TTL = 90.seconds
  HEARTBEAT = 30.seconds

  module_function

  # True when this was the user's only live connection, i.e. they just came online.
  def connect(user_id, connection_id)
    store.add(user_id, connection_id, TTL.from_now) == 1
  end

  def heartbeat(user_id, connection_id)
    store.add(user_id, connection_id, TTL.from_now)
  end

  # True when that was the user's last live connection, i.e. they just went offline.
  def disconnect(user_id, connection_id)
    store.remove(user_id, connection_id).zero?
  end

  def online?(user_id)
    online_ids([ user_id ]).any?
  end

  def online_ids(user_ids)
    store.online_ids(user_ids)
  end

  # Redis in development/production (the same server Action Cable already uses); an
  # in-process store in test, so specs don't need a Redis server.
  def store
    @store ||= Rails.env.test? ? MemoryStore.new : RedisStore.new(ENV.fetch("REDIS_URL", "redis://localhost:6379/1"))
  end
end
