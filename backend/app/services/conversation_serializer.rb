class ConversationSerializer < ApplicationService
  def initialize(conversation, current_user:)
    @conversation = conversation
    @current_user = current_user
  end

  def call
    other = @conversation.members.where.not(id: @current_user.id).first
    { id: @conversation.id, other_user: other && UserSerializer.call(other), created_at: @conversation.created_at }
  end
end
