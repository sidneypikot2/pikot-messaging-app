module Messages
  class UpdateService < ApplicationService
    def initialize(message:, sender:, body:)
      @message = message
      @sender = sender
      @body = body
    end

    def call
      raise NotAuthorizedError, "not the sender of this message" unless @message.sender_id == @sender.id

      @message.update!(body: @body, edited_at: Time.current)
      payload = { event: "message_updated", message: MessageSerializer.call(@message) }
      ConversationChannel.broadcast_to(@message.conversation, payload)
      @message.conversation.members.each { |member| NotificationsChannel.broadcast_to(member, payload) }
      @message
    end
  end
end
