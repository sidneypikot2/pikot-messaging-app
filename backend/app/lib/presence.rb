# Who's connected right now, and the status everyone else sees for them (KAN-39).
#
# Every open tab's NotificationsChannel subscription registers its own entry with an
# expiry that its heartbeat keeps pushing back, so:
# - several tabs count as one person (they're connected while any entry is live), and
# - a server that dies without running `unsubscribed` can't leave anyone connected for
#   longer than TTL — their entries just stop being refreshed and lapse.
# A tab can also mark itself away (no activity for a while); someone whose tabs are all
# away shows as idle.
module Presence
  TTL = 90.seconds
  HEARTBEAT = 30.seconds
  STATUSES = %w[online idle dnd offline].freeze

  module_function

  def connect(user_id, connection_id)
    store.add(user_id, connection_id, TTL.from_now)
  end

  def heartbeat(user_id, connection_id)
    connect(user_id, connection_id)
  end

  def disconnect(user_id, connection_id)
    store.remove(user_id, connection_id)
  end

  def set_away(user_id, connection_id, away)
    store.set_away(user_id, connection_id, away)
  end

  # What other people see for each user id: "online", "idle", "dnd" or "offline".
  # Not connected, or chose to appear offline → "offline"; chose idle/dnd → that;
  # otherwise "idle" when every open tab is away, else "online". A chosen status whose
  # timer has run out counts as "online".
  def statuses(user_ids)
    chosen = User.where(id: user_ids).to_h { |user| [ user.id, user.current_chosen_status ] }
    store.connections(user_ids).to_h do |user_id, (live, active)|
      status = if live.zero? || chosen[user_id] == "offline" then "offline"
      elsif chosen[user_id] != "online" then chosen[user_id]
      elsif active.zero? then "idle"
      else "online"
      end
      [ user_id, status ]
    end
  end

  def status(user_id)
    statuses([ user_id ])[user_id]
  end

  # Runs the block (a connect, disconnect, away change or chosen-status change), then —
  # only if that changed what other people see — records last_seen_at when they now
  # look offline and broadcasts the new status.
  def track(user)
    before = status(user.id)
    result = yield
    after = status(user.id)
    return result if after == before

    user.update_column(:last_seen_at, Time.current) if after == "offline"
    Users::PresenceBroadcaster.call(user, status: after)
    result
  end

  # Redis in development/production (the same server Action Cable already uses); an
  # in-process store in test, so specs don't need a Redis server.
  def store
    @store ||= Rails.env.test? ? MemoryStore.new : RedisStore.new(ENV.fetch("REDIS_URL", "redis://localhost:6379/1"))
  end
end
