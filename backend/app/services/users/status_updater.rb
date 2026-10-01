module Users
  # The user picking Online / Idle / Do Not Disturb / Offline from their status menu
  # (KAN-39). Goes through Presence.track so contacts hear about it only when what they
  # see changes (e.g. picking "Do Not Disturb" while not connected anywhere changes nothing).
  class StatusUpdater < ApplicationService
    def initialize(user, status)
      @user = user
      @status = status
    end

    def call
      Presence.track(@user) { @user.update!(chosen_status: @status) }
    end
  end
end
