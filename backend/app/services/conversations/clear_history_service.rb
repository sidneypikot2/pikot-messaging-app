module Conversations
  # "Delete chat" (KAN-41): hides everything sent so far from the viewer only and drops
  # the conversation from their list. Everyone else keeps the history, and a new message
  # brings the conversation back for them, starting from that message.
  class ClearHistoryService < ApplicationService
    def initialize(conversation:, user:)
      @conversation = conversation
      @user = user
    end

    def call
      membership = @conversation.conversation_memberships.find_by!(user_id: @user.id)
      # 0 for a chat with no messages yet, so it still counts as cleared.
      last_message_id = @conversation.messages.maximum(:id).to_i
      # Also counts as read, so nothing cleared can come back as an unread badge.
      membership.update!(cleared_message_id: last_message_id, last_read_message_id: last_message_id.nonzero? || membership.last_read_message_id)
      NotificationsChannel.broadcast_to(@user, event: "conversation_cleared", conversation_id: @conversation.id)
      membership
    end
  end
end
