module Conversations
  # Sets (or, when blank, clears) the chat's pinned note (KAN-44). Any member can edit it,
  # like the name and theme; each change gets a grey system line and syncs live to everyone.
  class NoteUpdateService < ApplicationService
    def initialize(conversation:, user:, body:)
      @conversation = conversation
      @user = user
      @body = body
    end

    def call
      raise NotAuthorizedError, "not a member of this conversation" unless @conversation.member?(@user)

      # Only "" clears the note: a missing or non-text body is a malformed request, not a removal.
      unless @body.is_a?(String)
        @conversation.errors.add(:note, "must be text")
        raise ActiveRecord::RecordInvalid, @conversation
      end

      @conversation.note = @body
      return @conversation unless @conversation.note_changed?

      @conversation.note_updated_by = @user
      @conversation.note_updated_at = Time.current
      @conversation.save!
      SystemMessageService.call(conversation: @conversation, actor: @user, event: { type: "note", cleared: @conversation.note.nil? })
      Broadcaster.call(@conversation)
      @conversation
    end
  end
end
