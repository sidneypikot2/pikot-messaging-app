class Conversation < ApplicationRecord
  NAME_MAX_LENGTH = 100

  # Direct (1:1) and group chats share one table (SPEC.md §5) so messages, reactions,
  # read markers and the Action Cable channel work the same for both (KAN-35).
  # No scopes: a `group` scope would clash with ActiveRecord's own `.group`.
  enum :kind, { direct: 0, group: 1 }, scopes: false

  belongs_to :owner, class_name: "User", optional: true
  has_many :conversation_memberships, dependent: :destroy
  has_many :members, through: :conversation_memberships, source: :user
  has_many :messages, dependent: :destroy

  normalizes :name, with: ->(name) { name.strip }

  validates :name, presence: true, length: { maximum: NAME_MAX_LENGTH }, if: :group?
end
