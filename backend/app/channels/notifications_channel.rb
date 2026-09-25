# Per-user stream, subscribed for the lifetime of a session (not per-conversation like
# ConversationChannel) — lets a client learn about new/updated conversations it hasn't
# opened yet, since it otherwise has no channel to be subscribed to for those (KAN-16).
class NotificationsChannel < ApplicationCable::Channel
  def subscribed
    stream_for current_user
  end
end
