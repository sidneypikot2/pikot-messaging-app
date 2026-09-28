class MessageSerializer < ApplicationService
  def initialize(message, current_user:)
    @message = message
    @current_user = current_user
  end

  def call
    {
      id: @message.id,
      conversation_id: @message.conversation_id,
      sender: UserSerializer.call(@message.sender),
      body: @message.deleted? ? nil : @message.body,
      deleted: @message.deleted?,
      edited: @message.edited?,
      created_at: @message.created_at,
      updated_at: @message.updated_at,
      reactions: grouped_reactions
    }
  end

  private

  def grouped_reactions
    @message.reactions.group(:emoji).count.map do |emoji, count|
      { emoji: emoji, count: count, reacted_by_me: @message.reactions.exists?(emoji: emoji, user: @current_user) }
    end
  end
end
