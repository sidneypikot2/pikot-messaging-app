module Conversations
  # Finds the existing 1:1 conversation between current_user and the other user, or
  # creates one (plus both memberships) if none exists yet.
  class FindOrCreateDirectService < ApplicationService
    def initialize(current_user:, other_user_id:)
      @current_user = current_user
      @other_user_id = other_user_id
    end

    def call
      raise ArgumentError, "cannot start a conversation with yourself" if @other_user_id.to_i == @current_user.id

      other_user = User.active.find(@other_user_id)
      find_existing(other_user) || create_direct(other_user)
    end

    private

    def find_existing(other_user)
      # Direct only — two people can also share any number of group chats (KAN-35).
      Conversation.where(kind: :direct).joins(:conversation_memberships)
        .where(conversation_memberships: { user_id: @current_user.id })
        .where(id: other_user.conversation_ids)
        .first
    end

    def create_direct(other_user)
      ActiveRecord::Base.transaction do
        conversation = Conversation.create!
        conversation.conversation_memberships.create!(user: @current_user)
        conversation.conversation_memberships.create!(user: other_user)
        conversation
      end
    end
  end
end
