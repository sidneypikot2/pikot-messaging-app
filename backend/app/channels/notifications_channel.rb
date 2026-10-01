# Per-user stream, subscribed for the lifetime of a session (not per-conversation like
# ConversationChannel) — lets a client learn about new/updated conversations it hasn't
# opened yet, since it otherwise has no channel to be subscribed to for those (KAN-16).
#
# Being subscribed is also what "online" means (KAN-39): one subscription per open tab,
# tracked in Presence. Only the first tab opening and the last one closing tell anyone.
class NotificationsChannel < ApplicationCable::Channel
  periodically :heartbeat, every: Presence::HEARTBEAT

  def subscribed
    stream_for current_user
    @presence_id = SecureRandom.uuid
    Users::PresenceBroadcaster.call(current_user) if Presence.connect(current_user.id, @presence_id)
  end

  def unsubscribed
    return unless @presence_id && Presence.disconnect(current_user.id, @presence_id)

    current_user.update_column(:last_seen_at, Time.current)
    Users::PresenceBroadcaster.call(current_user)
  end

  private

  # Also keeps last_seen_at close to the truth if the server dies without running
  # `unsubscribed` for this tab.
  def heartbeat
    Presence.heartbeat(current_user.id, @presence_id)
    current_user.update_column(:last_seen_at, Time.current)
  end
end
