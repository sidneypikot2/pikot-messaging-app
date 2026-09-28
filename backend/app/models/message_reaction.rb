class MessageReaction < ApplicationRecord
  belongs_to :message
  belongs_to :user

  validates :emoji, presence: true
  validates :emoji, uniqueness: { scope: [ :message_id, :user_id ] }
end
