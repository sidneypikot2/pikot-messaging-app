module Auth
  # Verifies email/password credentials. Returns the User on success, or a symbol
  # (:invalid_credentials, :unverified) the caller can branch on for the right
  # response — kept separate from Auth::SessionIssuer so future authenticators
  # (e.g. an OAuth one) can plug in ahead of the same session-issuing step.
  class PasswordAuthenticator < ApplicationService
    def initialize(email:, password:)
      @email = email.to_s.strip.downcase
      @password = password
    end

    def call
      user = User.find_by(email: @email)
      return :invalid_credentials unless user&.authenticate(@password)
      return :unverified unless user.verified?

      user
    end
  end
end
