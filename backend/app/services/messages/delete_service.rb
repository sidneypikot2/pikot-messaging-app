module Messages
  class DeleteService < ApplicationService
    def initialize(message:, sender:)
      @message = message
      @sender = sender
    end

    def call
      raise NotAuthorizedError, "not the sender of this message" unless @message.sender_id == @sender.id

      @message.update!(deleted_at: Time.current)
      ConversationChannel.broadcast_to(@message.conversation, event: "message_deleted", message: MessageSerializer.call(@message))
      @message
    end
  end
end
