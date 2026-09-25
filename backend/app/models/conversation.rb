class Conversation < ApplicationRecord
  has_many :conversation_memberships, dependent: :destroy
  has_many :members, through: :conversation_memberships, source: :user
  has_many :messages, dependent: :destroy
end
