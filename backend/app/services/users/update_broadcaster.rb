module Users
  # Tells everyone who shares a conversation with `user`, and the user's own other tabs,
  # that their name or photo changed (KAN-63) — or that the account is gone — so chat
  # lists, headers and message avatars redraw without a refetch.
  class UpdateBroadcaster < ApplicationService
    def initialize(user, recipients: nil)
      @user = user
      @recipients = recipients
    end

    def call
      payload = { event: "user_updated", user: UserSerializer.call(@user) }
      (@recipients || default_recipients).each { |recipient| NotificationsChannel.broadcast_to(recipient, payload) }
    end

    private

    def default_recipients
      User.where(id: ConversationMembership.where(conversation_id: @user.conversation_memberships.select(:conversation_id)).select(:user_id))
          .or(User.where(id: @user.id)).to_a
    end
  end
end
