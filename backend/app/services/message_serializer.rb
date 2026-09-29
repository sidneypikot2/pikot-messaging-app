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
      reactions: grouped_reactions,
      reply_to: reply_to
    }
  end

  private

  # One level only — the quoted message's own reply_to isn't included.
  def reply_to
    original = @message.reply_to_message
    return unless original

    # The current user unsent the original for themselves only (KAN-30).
    removed = original.hidden_for?(@current_user)
    {
      id: original.id,
      sender: UserSerializer.call(original.sender),
      body: original.deleted? || removed ? nil : original.body,
      deleted: original.deleted?,
      removed: removed
    }
  end

  def grouped_reactions
    @message.reactions.group(:emoji).count.map do |emoji, count|
      { emoji: emoji, count: count, reacted_by_me: @message.reactions.exists?(emoji: emoji, user: @current_user) }
    end
  end
end
