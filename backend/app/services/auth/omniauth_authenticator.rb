module Auth
  # Finds or creates a User from an OmniAuth auth hash (request.env["omniauth.auth"]).
  # Matches on provider+uid, not email — Apple only sends an email on the account's
  # first authorization, so keying on email would break returning Apple sign-ins.
  class OmniauthAuthenticator < ApplicationService
    def initialize(auth_hash)
      @auth_hash = auth_hash
    end

    def call
      user = User.find_or_create_by!(provider: @auth_hash.provider, uid: @auth_hash.uid) do |new_user|
        new_user.email = email_from_auth_hash
        new_user.first_name = @auth_hash.info&.first_name
        new_user.last_name = @auth_hash.info&.last_name
        new_user.username = generate_username
        new_user.verified_at = Time.current
      end
      attach_avatar(user) unless user.avatar.attached?
      user
    end

    private

    # find_or_create_by! only runs this block on the create path, so an existing user's
    # email/name/username is never overwritten by a later login where the provider sent
    # different or withheld data.
    def email_from_auth_hash
      @auth_hash.info&.email.presence || "#{@auth_hash.provider}-#{@auth_hash.uid}@users.pikotchat.local"
    end

    # Facebook has no equivalent of this app's `username` in its OAuth profile data, so
    # it's derived here — from the email's local part where available, matching the
    # format/length/uniqueness rules already on User rather than inventing new ones.
    def generate_username
      base = sanitize_username(username_base)
      base = "user" if base.length < 3

      candidate = base
      suffix = 1
      while User.where("LOWER(username) = ?", candidate.downcase).exists?
        suffix_str = suffix.to_s
        candidate = "#{base.first(30 - suffix_str.length)}#{suffix_str}"
        suffix += 1
      end
      candidate
    end

    def username_base
      if @auth_hash.info&.email.present?
        @auth_hash.info.email.split("@").first
      elsif @auth_hash.info&.first_name.present? || @auth_hash.info&.last_name.present?
        "#{@auth_hash.info&.first_name}#{@auth_hash.info&.last_name}"
      else
        "#{@auth_hash.provider}user"
      end
    end

    def sanitize_username(value)
      value.to_s.downcase.gsub(/[^a-z0-9_]/, "").first(30)
    end

    # A missing/failed avatar just falls back to the initials avatar client-side — not
    # worth failing the whole sign-in over, so failures are logged and swallowed here.
    def attach_avatar(user)
      image_url = @auth_hash.info&.image
      return if image_url.blank? || image_url !~ %r{\Ahttps?://}

      downloaded = URI.open(image_url) # rubocop:disable Security/Open -- protocol-checked above, not raw user input
      user.avatar.attach(io: downloaded, filename: "#{@auth_hash.provider}-avatar.jpg")
    rescue StandardError => e
      Rails.logger.warn("Failed to attach #{@auth_hash.provider} avatar for user #{user.id}: #{e.message}")
    end
  end
end
