class ConversationSerializer < ApplicationService
  def initialize(conversation, current_user:, unread_count: 0)
    @conversation = conversation
    @current_user = current_user
    @unread_count = unread_count
  end

  def call
    other = @conversation.members.where.not(id: @current_user.id).first
    { id: @conversation.id, other_user: other && UserSerializer.call(other), created_at: @conversation.created_at,
      unread_count: @unread_count }
  end
end
