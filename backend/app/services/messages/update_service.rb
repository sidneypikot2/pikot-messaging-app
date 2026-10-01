module Messages
  class UpdateService < ApplicationService
    def initialize(message:, sender:, body:)
      @message = message
      @sender = sender
      @body = body
    end

    def call
      raise NotAuthorizedError, "not the sender of this message" unless @message.sender_id == @sender.id
      raise NotAuthorizedError, "system messages can't be changed" if @message.system?

      @message.update!(body: @body, edited_at: Time.current)
      payload = { event: "message_updated", message: MessageSerializer.call(@message, current_user: @sender) }
      ConversationChannel.broadcast_to(@message.conversation, payload)
      @message.conversation.members.each { |member| NotificationsChannel.broadcast_to(member, payload) }
      @message
    end
  end
end
