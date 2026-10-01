module Conversations
  # Tells every member's tabs that a conversation's settings changed (KAN-41) — name,
  # theme, nicknames or members — with the conversation serialized for each of them,
  # since the serializer is viewer-relative (mute, presence, read receipts).
  class Broadcaster < ApplicationService
    def initialize(conversation, event: "conversation_updated", users: nil)
      @conversation = conversation
      @event = event
      @users = users
    end

    def call
      (@users || @conversation.members.to_a).each do |user|
        NotificationsChannel.broadcast_to(user, event: @event, conversation: ConversationSerializer.call(@conversation, current_user: user))
      end
    end
  end
end
