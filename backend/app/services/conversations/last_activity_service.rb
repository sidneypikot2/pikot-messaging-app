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

    # Messages left after "delete chat" (KAN-41), minus anything unsent for this viewer.
    def visible_messages
      cleared = @conversation.conversation_memberships.find_by(user_id: @user.id)&.cleared_message_id
      scope = @conversation.messages.where.not(id: hidden_message_ids)
      cleared ? scope.where("messages.id > ?", cleared) : scope
    end

    def latest_message
      visible_messages.includes(:sender).order(id: :desc).first
    end

    # Reactions on unsent, hidden or cleared messages don't count — the viewer can't see what
    # they'd be pointing at.
    def latest_reaction
      MessageReaction.joins(:message)
        .where(message_id: visible_messages.where(deleted_at: nil).select(:id))
        .includes(:user, :message)
        .order(created_at: :desc, id: :desc)
        .first
    end

    def message_activity(message)
      { type: "message", kind: message.kind, system_event: message.system_event,
        actor: UserSerializer.call(message.sender), deleted: message.deleted?,
        body: message.deleted? ? nil : message.body.truncate(BODY_PREVIEW_LENGTH), at: message.created_at }
    end

    def reaction_activity(reaction)
      { type: "reaction", actor: UserSerializer.call(reaction.user), emoji: reaction.emoji,
        message_sender_id: reaction.message.sender_id, at: reaction.created_at }
    end
  end
end
