class ConversationSerializer < ApplicationService
  def initialize(conversation, current_user:, unread_count: 0)
    @conversation = conversation
    @current_user = current_user
    @unread_count = unread_count
  end

  def call
    other = @conversation.members.where.not(id: @current_user.id).first
    { id: @conversation.id, other_user: other && UserSerializer.call(other), created_at: @conversation.created_at,
      unread_count: @unread_count, last_activity: Conversations::LastActivityService.call(@conversation, user: @current_user),
      read_receipts: read_receipts }
  end

  private

  # How far each *other* member has read (KAN-36) — a list rather than one field so group
  # chats (KAN-35) can show several "seen by" avatars from the same data.
  def read_receipts
    @conversation.conversation_memberships.includes(:user).where.not(user_id: @current_user.id).map do |membership|
      { user: UserSerializer.call(membership.user), last_read_message_id: membership.last_read_message_id,
        last_read_at: membership.last_read_at }
    end
  end
end
