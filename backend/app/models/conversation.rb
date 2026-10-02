class Conversation < ApplicationRecord
  NAME_MAX_LENGTH = 100
  # Pinned note (KAN-44) — long enough for an address, a plan and a few links.
  NOTE_MAX_LENGTH = 2000
  # Chat theme presets (KAN-41); nil is the app's own orange.
  THEMES = %w[orange blue purple pink green red teal].freeze

  # Direct (1:1) and group chats share one table (SPEC.md section 1) so messages, reactions,
  # read markers and the Action Cable channel work the same for both (KAN-35).
  # No scopes: a `group` scope would clash with ActiveRecord's own `.group`.
  enum :kind, { direct: 0, group: 1 }, scopes: false

  belongs_to :owner, class_name: "User", optional: true
  belongs_to :note_updated_by, class_name: "User", optional: true
  has_many :conversation_memberships, dependent: :destroy
  has_many :members, through: :conversation_memberships, source: :user
  has_many :messages, dependent: :destroy

  normalizes :name, with: ->(name) { name.strip }
  normalizes :note, with: ->(note) { note.strip.presence }

  validates :name, presence: true, length: { maximum: NAME_MAX_LENGTH }, if: :group?
  validates :theme, inclusion: { in: THEMES }, allow_nil: true
  validates :note, length: { maximum: NOTE_MAX_LENGTH }

  def membership_for(user)
    conversation_memberships.find_by(user_id: user.id)
  end

  def member?(user)
    conversation_memberships.exists?(user_id: user.id)
  end
end
