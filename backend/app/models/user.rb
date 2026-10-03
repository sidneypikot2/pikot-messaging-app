class User < ApplicationRecord
  has_secure_password validations: false
  has_one_attached :avatar

  has_many :conversation_memberships, dependent: :destroy
  has_many :conversations, through: :conversation_memberships
  has_many :message_hides, dependent: :destroy
  has_many :sent_messages, class_name: "Message", foreign_key: :sender_id, inverse_of: :sender, dependent: :destroy

  # What the user picked from their status menu (KAN-39) — what others actually see also
  # depends on whether they're connected (Presence.statuses). Never serialized for other
  # users: "offline" here means "appear offline", and that has to stay a secret.
  enum :chosen_status, Presence::STATUSES.index_by(&:itself), prefix: true, validate: true
  # Do Not Disturb / Offline can be picked for a while (10 min … 24 h) instead of until
  # turned off; once this passes they're back to Online.
  validates :chosen_status_until, absence: true, unless: -> { chosen_status_dnd? || chosen_status_offline? }

  # Deleted accounts (KAN-63) keep their row for the messages they sent; they can't sign
  # in, be found, or be added to a chat.
  scope :active, -> { where(deleted_at: nil) }

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
  # users can start with a blank name/username and fill them in from Settings (KAN-63).
  validates :first_name, presence: true, if: -> { !oauth_user? }
  validates :last_name, presence: true, if: -> { !oauth_user? }
  # OAuth users may leave it blank, but one they choose in settings (KAN-63) follows the
  # same rules.
  validates :username, presence: true, if: -> { !oauth_user? }
  validates :username, length: { in: 3..30 },
                        format: { with: /\A[a-zA-Z0-9_]+\z/, message: "only letters, numbers, and underscores" },
                        uniqueness: { case_sensitive: false },
                        allow_blank: true
  validate :avatar_content_type_and_size, if: -> { avatar.attached? }

  generates_token_for :email_verification, expires_in: 24.hours do
    email
  end

  # The chosen status with any expired timer applied — the NotificationsChannel
  # heartbeat only gets round to resetting the column within 30s of it passing.
  def current_chosen_status
    chosen_status_expired? ? "online" : chosen_status
  end

  def chosen_status_expired?
    chosen_status_until.present? && chosen_status_until <= Time.current
  end

  # "Alice Smith", or the username/email for OAuth users who never gave a name — same
  # fallback as the frontend's displayName.
  def display_name
    return DELETED_NAME if deleted?

    "#{first_name} #{last_name}".strip.presence || username.presence || email
  end

  DELETED_NAME = "PikotChat user".freeze

  def deleted?
    deleted_at.present?
  end

  PROVIDER_NAMES = { "facebook" => "Facebook", "linkedin" => "LinkedIn", "google_oauth2" => "Google", "apple" => "Apple" }.freeze

  # "Google" for google_oauth2, and so on — for messages about how someone signs in.
  def provider_name
    PROVIDER_NAMES.fetch(provider, provider&.capitalize)
  end

  # Signed up with Google/Facebook/… and never had a password (KAN-63).
  def password_set?
    password_digest.present?
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

  private

  ALLOWED_AVATAR_CONTENT_TYPES = %w[image/png image/jpeg image/webp image/gif].freeze
  MAX_AVATAR_SIZE = 5.megabytes

  # No active_storage_validations gem here — content_type/size checks aren't built into
  # core Rails' `validates`, and this is small enough to hand-roll (same minimalism as
  # this app's hand-rolled JWT lib instead of devise).
  def avatar_content_type_and_size
    errors.add(:avatar, "must be a PNG, JPEG, WEBP, or GIF") unless ALLOWED_AVATAR_CONTENT_TYPES.include?(avatar.content_type)
    errors.add(:avatar, "must be smaller than 5MB") if avatar.byte_size > MAX_AVATAR_SIZE
  end
end
