module Messages
  class HideService < ApplicationService
    def initialize(message:, user:)
      @message = message
      @user = user
    end

    def call
      raise NotAuthorizedError, "not a member of this conversation" unless member?

      @message.hides.create_or_find_by!(user: @user)
      # Only the hiding user's own tabs need to drop it — nobody else's view changes.
      NotificationsChannel.broadcast_to(@user, { event: "message_hidden", message_id: @message.id, conversation_id: @message.conversation_id })
      @message
    end

    private

    def member?
      @message.conversation.conversation_memberships.exists?(user_id: @user.id)
    end
  end
end
