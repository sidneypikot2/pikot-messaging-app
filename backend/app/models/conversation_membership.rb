class ConversationMembership < ApplicationRecord
  belongs_to :conversation
  belongs_to :user
  belongs_to :last_read_message, class_name: "Message", optional: true

  NICKNAME_MAX_LENGTH = 50
  # "Until I turn it back on" (KAN-41) is stored as a mute that never runs out in practice.
  MUTED_FOREVER = Time.utc(9999, 12, 31)

  normalizes :nickname, with: ->(nickname) { nickname.strip.presence }

  validates :user_id, uniqueness: { scope: :conversation_id }
  validates :nickname, length: { maximum: NICKNAME_MAX_LENGTH }

  def muted?
    muted_until.present? && muted_until.future?
  end

  def muted_forever?
    muted? && muted_until >= MUTED_FOREVER
  end
end
