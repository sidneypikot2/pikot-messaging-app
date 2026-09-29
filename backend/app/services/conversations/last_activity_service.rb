module Conversations
  # The one-line preview under a conversation in the list (KAN-32): the latest message
  # the viewer can still see, or the latest reaction if one is newer than that message.
  # Computed per viewer since "unsend for you" (KAN-30) hides messages from one user only.
  class LastActivityService < ApplicationService
    BODY_PREVIEW_LENGTH = 100

    def initialize(conversation, user:)
      @conversation = conversation
      @user = user
    end

    def call
      message = latest_message
      reaction = latest_reaction

      if reaction && (message.nil? || reaction.created_at > message.created_at)
        reaction_activity(reaction)
      elsif message
        message_activity(message)
      end
    end

    private

    def hidden_message_ids
      MessageHide.where(user_id: @user.id).select(:message_id)
    end

    def latest_message
      @conversation.messages.where.not(id: hidden_message_ids).includes(:sender).order(id: :desc).first
    end

    # Reactions on unsent or hidden messages don't count — the viewer can't see what
    # they'd be pointing at.
    def latest_reaction
      MessageReaction.joins(:message)
        .where(messages: { conversation_id: @conversation.id, deleted_at: nil })
        .where.not(message_id: hidden_message_ids)
        .includes(:user, :message)
        .order(created_at: :desc, id: :desc)
        .first
    end

    def message_activity(message)
      { type: "message", actor: UserSerializer.call(message.sender), deleted: message.deleted?,
        body: message.deleted? ? nil : message.body.truncate(BODY_PREVIEW_LENGTH), at: message.created_at }
    end

    def reaction_activity(reaction)
      { type: "reaction", actor: UserSerializer.call(reaction.user), emoji: reaction.emoji,
        message_sender_id: reaction.message.sender_id, at: reaction.created_at }
    end
  end
end
