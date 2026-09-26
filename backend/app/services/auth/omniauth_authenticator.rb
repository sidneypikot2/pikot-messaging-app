module Auth
  # Finds or creates a User from an OmniAuth auth hash (request.env["omniauth.auth"]).
  # Matches on provider+uid first, not email — Apple only sends an email on the account's
  # first authorization, so keying on email would break returning Apple sign-ins. Only
  # when that lookup misses (i.e. this provider has never been linked before) do we fall
  # back to matching by email, to link this provider onto an existing account rather than
  # blowing up on User's email-uniqueness validation — the provider has already verified
  # that email before handing it to us, so treating a match as proof of ownership and
  # linking is reasonable rather than rejecting the sign-in outright.
  class OmniauthAuthenticator < ApplicationService
    def initialize(auth_hash)
      @auth_hash = auth_hash
    end

    def call
      user = User.find_by(provider: @auth_hash.provider, uid: @auth_hash.uid) ||
             link_existing_account_by_email ||
             create_user
      attach_avatar(user) unless user.avatar.attached?
      user
    end

    private

    # Only ever runs on the very first sign-in with this provider (the provider+uid
    # lookup in #call already covers returning sign-ins), so it never overwrites an
    # existing user's email/name/username with what a later login happens to send.
    def link_existing_account_by_email
      email = @auth_hash.info&.email
      return nil if email.blank?

      existing = User.find_by("LOWER(email) = ?", email.downcase)
      return nil unless existing

      existing.update!(provider: @auth_hash.provider, uid: @auth_hash.uid)
      existing
    end

    def create_user
      # Facebook only exposes a combined `name`, not first_name/last_name separately —
      # split(" ") gives [first, last] ("First Last" order).
      name = @auth_hash.info&.name&.split(" ") || []

      User.create!(
        email: email_from_auth_hash,
        first_name: name[0],
        last_name: name[1],
        username: generate_username,
        provider: @auth_hash.provider,
        uid: @auth_hash.uid,
        verified_at: Time.current
      )
    end

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
      elsif @auth_hash.info&.name.present?
        @auth_hash.info.name
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
