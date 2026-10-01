# Per-user stream, subscribed for the lifetime of a session (not per-conversation like
# ConversationChannel) — lets a client learn about new/updated conversations it hasn't
# opened yet, since it otherwise has no channel to be subscribed to for those (KAN-16).
#
# Being subscribed is also what being connected means for presence (KAN-39): one
# subscription per open tab, tracked in Presence, which tells people only when what
# they'd see for this user actually changes.
class NotificationsChannel < ApplicationCable::Channel
  periodically :heartbeat, every: Presence::HEARTBEAT

  def subscribed
    stream_for current_user
    @presence_id = SecureRandom.uuid
    Presence.track(current_user) { Presence.connect(current_user.id, @presence_id) }
  end

  def unsubscribed
    return unless @presence_id

    Presence.track(current_user) { Presence.disconnect(current_user.id, @presence_id) }
  end

  # Auto-idle: the tab says it's had no activity for a while (or has again).
  def away(data)
    Presence.track(current_user) { Presence.set_away(current_user.id, @presence_id, data["away"] == true) }
  end

  private

  # Also keeps last_seen_at close to the truth if the server dies without running
  # `unsubscribed` — except while appearing offline, where it has to stay frozen at the
  # moment they "left".
  def heartbeat
    Presence.heartbeat(current_user.id, @presence_id)
    current_user.update_column(:last_seen_at, Time.current) unless Presence.status(current_user.id) == "offline"
  end
end
