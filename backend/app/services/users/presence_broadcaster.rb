module Users
  # Tells everyone who shares a conversation with `user` what status they now see for
  # them (KAN-39), so dots and "Active 5m ago" update without a refetch — and the user's
  # own other tabs, so their status picker stays in sync.
  class PresenceBroadcaster < ApplicationService
    def initialize(user, status:)
      @user = user
      @status = status
    end

    def call
      payload = { event: "presence", user_id: @user.id, status: @status, last_seen_at: @user.last_seen_at }
      recipients.find_each { |recipient| NotificationsChannel.broadcast_to(recipient, payload) }
    end

    private

    def recipients
      User.where(id: ConversationMembership.where(conversation_id: @user.conversation_memberships.select(:conversation_id)).select(:user_id))
          .or(User.where(id: @user.id))
    end
  end
end
