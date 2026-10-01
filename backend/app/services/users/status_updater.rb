module Users
  # The user picking Online / Idle / Do Not Disturb / Offline from their status menu
  # (KAN-39), optionally for a while (`duration_minutes`; Do Not Disturb and Offline only).
  # Goes through Presence.track so contacts hear about it only when what they see changes
  # (e.g. picking "Do Not Disturb" while not connected anywhere changes nothing).
  class StatusUpdater < ApplicationService
    DURATIONS = [ 10, 30, 60, 6 * 60, 24 * 60 ].freeze

    def initialize(user, status, duration_minutes: nil)
      @user = user
      @status = status
      @duration_minutes = duration_minutes&.to_i
    end

    def call
      if @duration_minutes && DURATIONS.exclude?(@duration_minutes)
        @user.errors.add(:base, "Duration must be one of #{DURATIONS.to_sentence(two_words_connector: ' or ', last_word_connector: ' or ')} minutes")
        raise ActiveRecord::RecordInvalid, @user
      end

      until_at = @duration_minutes&.minutes&.from_now
      Presence.track(@user) { @user.update!(chosen_status: @status, chosen_status_until: until_at) }
    end
  end
end
