module Conversations
  # Mutes a conversation's notifications for the viewer only (KAN-41) — no sound or
  # pop-up for it — for a while, or until they turn it back on (`minutes` nil).
  # `minutes: false` unmutes.
  class MuteService < ApplicationService
    DURATIONS = [ 15, 60, 8 * 60, 24 * 60 ].freeze

    def initialize(conversation:, user:, minutes:)
      @conversation = conversation
      @user = user
      @minutes = minutes
    end

    def call
      membership = @conversation.conversation_memberships.find_by!(user_id: @user.id)
      validate!(membership)

      membership.update!(muted_until: muted_until)
      # Only this user's own tabs care.
      Broadcaster.call(@conversation, users: [ @user ])
      membership
    end

    private

    def muted_until
      return nil if @minutes == false
      return ConversationMembership::MUTED_FOREVER if @minutes.nil?

      @minutes.to_i.minutes.from_now
    end

    def validate!(membership)
      return if @minutes == false || @minutes.nil? || DURATIONS.include?(@minutes.to_i)

      membership.errors.add(:base, "Mute for #{DURATIONS.to_sentence(two_words_connector: ' or ', last_word_connector: ' or ')} minutes, or until turned back on")
      raise ActiveRecord::RecordInvalid, membership
    end
  end
end
