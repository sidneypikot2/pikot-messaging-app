class ConversationsController < ApplicationController
  before_action :authenticate_request!

  def index
    conversations = current_user.conversations.includes(:note_updated_by).where.not(id: cleared_conversation_ids).order(updated_at: :desc)
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

  def update
    conversation = Conversations::UpdateService.call(
      conversation: current_user.conversations.find(params[:id]), user: current_user, name: params[:name], theme: params[:theme]
    )
    render json: { conversation: ConversationSerializer.call(conversation, current_user: current_user) }
  end

  # "Delete chat" — for the current user only (KAN-41).
  def destroy
    Conversations::ClearHistoryService.call(conversation: current_user.conversations.find(params[:id]), user: current_user)
    head :no_content
  end

  def read
    conversation = current_user.conversations.find(params[:id])
    Conversations::MarkReadService.call(conversation: conversation, user: current_user)
    head :no_content
  end

  private

  # Conversations the user deleted (KAN-41) that nothing new has been sent in since.
  def cleared_conversation_ids
    current_user.conversation_memberships.where.not(cleared_message_id: nil)
      .where("NOT EXISTS (SELECT 1 FROM messages WHERE messages.conversation_id = conversation_memberships.conversation_id " \
             "AND messages.id > conversation_memberships.cleared_message_id)")
      .select(:conversation_id)
  end

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
