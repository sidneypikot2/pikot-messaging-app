module Messages
  class CreateService < ApplicationService
    def initialize(conversation:, sender:, body:)
      @conversation = conversation
      @sender = sender
      @body = body
    end

    def call
      raise NotAuthorizedError, "not a member of this conversation" unless member?

      message = @conversation.messages.create!(sender: @sender, body: @body)
      ConversationChannel.broadcast_to(@conversation, event: "message_created", message: MessageSerializer.call(message))
      message
    end

    private

    def member?
      @conversation.conversation_memberships.exists?(user_id: @sender.id)
    end
  end
end
