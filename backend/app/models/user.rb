class User < ApplicationRecord
  has_secure_password validations: false

  normalizes :email, with: ->(email) { email.strip.downcase }

  validates :email, presence: true, uniqueness: { case_sensitive: false },
                     format: { with: URI::MailTo::EMAIL_REGEXP }
  # Max 72: has_secure_password's default validations (disabled above so password can be
  # blank for oauth_user?) include this to protect bcrypt, which silently ignores bytes
  # beyond 72 — worth keeping regardless of whether a password is required.
  validates :password, length: { minimum: 8, maximum: 72 }, allow_nil: true
  validates :password, presence: true, confirmation: true, on: :create, if: -> { !oauth_user? }
  validates :password_confirmation, presence: true, on: :create, if: -> { !oauth_user? }

  # Not collected during OAuth signup, so gated the same way password is above — OAuth
  # users end up with blank name/username until a future profile-completion flow exists.
  validates :first_name, presence: true, if: -> { !oauth_user? }
  validates :last_name, presence: true, if: -> { !oauth_user? }
  validates :username, presence: true, length: { in: 3..30 },
                        format: { with: /\A[a-zA-Z0-9_]+\z/, message: "only letters, numbers, and underscores" },
                        uniqueness: { case_sensitive: false },
                        if: -> { !oauth_user? }

  generates_token_for :email_verification, expires_in: 24.hours do
    email
  end

  def verified?
    verified_at.present?
  end

  def oauth_user?
    provider.present?
  end

  def deliver_email_verification
    UserMailer.email_verification(self).deliver_later
  end
end
