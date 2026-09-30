module Conversations
  # Moves the user's "read up to" marker to the conversation's latest message and, when it
  # actually moved, tells everyone with the conversation open so the sender's "seen"
  # avatar can follow along live (KAN-36). The broadcast is per reader rather than per
  # conversation, so group chats (KAN-35) can reuse it for "seen by" as-is.
  class MarkReadService < ApplicationService
    def initialize(conversation:, user:)
      @conversation = conversation
      @user = user
    end

    def call
      membership = @conversation.conversation_memberships.find_by!(user_id: @user.id)
      last_message_id = @conversation.messages.maximum(:id)
      return membership if last_message_id.nil? || last_message_id <= membership.last_read_message_id.to_i

      membership.update!(last_read_message_id: last_message_id)
      ConversationChannel.broadcast_to(@conversation, event: "read", conversation_id: @conversation.id,
                                                      user: UserSerializer.call(@user), last_read_message_id: last_message_id)
      membership
    end
  end
end
