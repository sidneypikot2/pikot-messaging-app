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
      ConversationChannel.broadcast_to(@message.conversation, event: "message_updated", message: MessageSerializer.call(@message))
      @message
    end
  end
end
