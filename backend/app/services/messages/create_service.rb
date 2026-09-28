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
      payload = { event: "message_created", message: MessageSerializer.call(message, current_user: @sender) }
      ConversationChannel.broadcast_to(@conversation, payload)
      # Also to each member's personal channel — a member who hasn't opened this
      # conversation (or, for a first message, didn't even know it existed) has no
      # ConversationChannel subscription to receive the broadcast above (KAN-16).
      @conversation.members.each { |member| NotificationsChannel.broadcast_to(member, payload) }
      message
    end

    private

    def member?
      @conversation.conversation_memberships.exists?(user_id: @sender.id)
    end
  end
end
