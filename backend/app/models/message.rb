class Message < ApplicationRecord
  belongs_to :conversation
  belongs_to :sender, class_name: "User"
  belongs_to :reply_to_message, class_name: "Message", optional: true
  has_many :reactions, class_name: "MessageReaction", dependent: :destroy

  validates :body, presence: true, length: { maximum: 5000 }
  # optional: true skips the existence check, so a reply_to_message_id pointing at no
  # row would otherwise reach the foreign key and 500.
  validates :reply_to_message, presence: { message: "must exist" }, on: :create, if: -> { reply_to_message_id.present? }
  validate :reply_to_message_is_repliable, on: :create, if: :reply_to_message

  def deleted?
    deleted_at.present?
  end

  def edited?
    edited_at.present?
  end

  private

  def reply_to_message_is_repliable
    if reply_to_message.conversation_id != conversation_id
      errors.add(:reply_to_message, "must be in the same conversation")
    elsif reply_to_message.deleted?
      errors.add(:reply_to_message, "has been deleted")
    end
  end
end
