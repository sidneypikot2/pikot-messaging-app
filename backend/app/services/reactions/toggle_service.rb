module Reactions
  class ToggleService < ApplicationService
    def initialize(message:, user:, emoji:)
      @message = message
      @user = user
      @emoji = emoji
    end

    def call
      raise NotAuthorizedError, "not a member of this conversation" unless member?
      raise NotAuthorizedError, "system messages can't be reacted to" if @message.system?

      existing = @message.reactions.find_by(user: @user, emoji: @emoji)

      if existing
        existing.destroy!
        broadcast("reaction_removed", @emoji)
      else
        @message.reactions.create!(user: @user, emoji: @emoji)
        broadcast("reaction_added", @emoji)
      end

      @message
    end

    private

    def member?
      @message.conversation.conversation_memberships.exists?(user_id: @user.id)
    end

    def broadcast(event, emoji)
      # message_sender_id + user let the message's author tell "someone reacted to my
      # message" apart from every other reaction broadcast, and name who did (KAN-31).
      payload = { event: event, message_id: @message.id, message_sender_id: @message.sender_id,
                  user: UserSerializer.call(@user), reaction: reaction_group(emoji) }
      ConversationChannel.broadcast_to(@message.conversation, payload)
      @message.conversation.members.each do |member|
        NotificationsChannel.broadcast_to(member, payload.merge(conversation_id: @message.conversation_id))
      end
    end

    def reaction_group(emoji)
      { emoji: emoji, count: @message.reactions.where(emoji: emoji).count, user_id: @user.id }
    end
  end
end
