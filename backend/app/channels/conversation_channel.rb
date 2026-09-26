class ConversationChannel < ApplicationCable::Channel
  def subscribed
    conversation = Conversation.find(params[:conversation_id])

    if conversation.conversation_memberships.exists?(user_id: current_user.id)
      stream_for conversation
    else
      reject
    end
  rescue ActiveRecord::RecordNotFound
    reject
  end

  def unsubscribed
    stop_all_streams
  end

  # Ephemeral, no persistence (SPEC.md) — re-broadcasts to everyone else with this
  # conversation open. No "stopped typing" counterpart; the receiver just lets its own
  # indicator expire a few seconds after the last ping it received.
  def typing(*)
    conversation = Conversation.find(params[:conversation_id])
    return unless conversation.conversation_memberships.exists?(user_id: current_user.id)

    ConversationChannel.broadcast_to(conversation, event: "typing", user: UserSerializer.call(current_user))
  rescue ActiveRecord::RecordNotFound
    nil
  end
end
