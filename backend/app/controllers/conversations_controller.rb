class ConversationsController < ApplicationController
  before_action :authenticate_request!

  def index
    conversations = current_user.conversations.order(updated_at: :desc)
    unread_counts = unread_counts_for(conversations)
    serialized = conversations.map { |c| ConversationSerializer.call(c, current_user: current_user, unread_count: unread_counts[c.id] || 0) }
    # Most recent activity first, Messenger-style (KAN-32) — nothing touches a
    # conversation's own updated_at when a message or reaction lands in it.
    render json: { conversations: serialized.sort_by { |c| c.dig(:last_activity, :at) || c[:created_at] }.reverse }
  end

  def show
    conversation = current_user.conversations.find(params[:id])
    render json: { conversation: ConversationSerializer.call(conversation, current_user: current_user) }
  end

  def create
    conversation = Conversations::FindOrCreateDirectService.call(current_user: current_user, other_user_id: params[:user_id])
    render json: { conversation: ConversationSerializer.call(conversation, current_user: current_user) }, status: :created
  end

  def read
    conversation = current_user.conversations.find(params[:id])
    membership = conversation.conversation_memberships.find_by!(user_id: current_user.id)
    last_message_id = conversation.messages.maximum(:id)
    membership.update!(last_read_message_id: last_message_id) if last_message_id
    head :no_content
  end

  private

  # One correlated-subquery COUNT per conversation, reading each conversation's own
  # membership threshold for the current user via the unique index on
  # conversation_memberships(conversation_id, user_id) — avoids N+1 across the list and
  # avoids pulling full row sets into Ruby just to count them.
  def unread_counts_for(conversations)
    Message
      .where(conversation_id: conversations.map(&:id))
      .where.not(sender_id: current_user.id)
      .where(
        "messages.id > COALESCE((
           SELECT last_read_message_id FROM conversation_memberships
           WHERE conversation_memberships.conversation_id = messages.conversation_id
           AND conversation_memberships.user_id = ?
         ), 0)", current_user.id
      )
      .group(:conversation_id)
      .count
  end
end
