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
  # indicator expire a few seconds after the last ping it received. Also goes to the other
  # members' NotificationsChannel so their conversation list can show "typing…" for a
  # conversation they don't have open (KAN-38).
  def typing(*)
    conversation = Conversation.find(params[:conversation_id])
    return unless conversation.conversation_memberships.exists?(user_id: current_user.id)

    user = UserSerializer.call(current_user)
    ConversationChannel.broadcast_to(conversation, event: "typing", user: user)
    conversation.members.where.not(id: current_user.id).each do |member|
      NotificationsChannel.broadcast_to(member, event: "typing", conversation_id: conversation.id, user: user)
    end
  rescue ActiveRecord::RecordNotFound
    nil
  end
end
