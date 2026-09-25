class Message < ApplicationRecord
  belongs_to :conversation
  belongs_to :sender, class_name: "User"

  validates :body, presence: true, length: { maximum: 5000 }

  def deleted?
    deleted_at.present?
  end

  def edited?
    edited_at.present?
  end
end
