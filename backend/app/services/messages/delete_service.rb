module Messages
  class DeleteService < ApplicationService
    def initialize(message:, sender:)
      @message = message
      @sender = sender
    end

    def call
      raise NotAuthorizedError, "not the sender of this message" unless @message.sender_id == @sender.id

      @message.update!(deleted_at: Time.current)
      payload = { event: "message_deleted", message: MessageSerializer.call(@message, current_user: @sender) }
      ConversationChannel.broadcast_to(@message.conversation, payload)
      @message.conversation.members.each { |member| NotificationsChannel.broadcast_to(member, payload) }
      @message
    end
  end
end
