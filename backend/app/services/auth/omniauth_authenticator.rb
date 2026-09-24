module Auth
  # Finds or creates a User from an OmniAuth auth hash (request.env["omniauth.auth"]).
  # Matches on provider+uid, not email — Apple only sends an email on the account's
  # first authorization, so keying on email would break returning Apple sign-ins.
  class OmniauthAuthenticator < ApplicationService
    def initialize(auth_hash)
      @auth_hash = auth_hash
    end

    def call
      User.find_or_create_by!(provider: @auth_hash.provider, uid: @auth_hash.uid) do |user|
        user.email = email_from_auth_hash
        user.verified_at = Time.current
      end
    end

    private

    # find_or_create_by! only runs this block on the create path, so an existing user's
    # email is never overwritten by a later login where the provider withheld it.
    def email_from_auth_hash
      @auth_hash.info&.email.presence || "#{@auth_hash.provider}-#{@auth_hash.uid}@users.pikotchat.local"
    end
  end
end
