class User < ApplicationRecord
  has_secure_password

  normalizes :email, with: ->(email) { email.strip.downcase }

  validates :email, presence: true, uniqueness: { case_sensitive: false },
                     format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :password, length: { minimum: 8 }, allow_nil: true
  validates :password_confirmation, presence: true, on: :create

  generates_token_for :email_verification, expires_in: 24.hours do
    email
  end

  def verified?
    verified_at.present?
  end

  def deliver_email_verification
    UserMailer.email_verification(self).deliver_later
  end
end
