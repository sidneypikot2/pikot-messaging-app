module Auth
  # Creates an unverified user and sends the verification email. Returns the User either
  # way (persisted on success; unsaved with #errors populated on failure) so the caller
  # can branch on user.persisted? without the service raising.
  class UserRegistrar < ApplicationService
    def initialize(email: nil, password: nil, password_confirmation: nil)
      @email = email
      @password = password
      @password_confirmation = password_confirmation
    end

    def call
      user = User.new(email: @email, password: @password, password_confirmation: @password_confirmation)
      user.deliver_email_verification if user.save
      user
    end
  end
end
