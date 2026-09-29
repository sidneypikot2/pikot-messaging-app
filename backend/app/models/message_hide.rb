# "Unsend for you" (KAN-30): hides a message from one user's view only; everyone else
# still sees it.
class MessageHide < ApplicationRecord
  belongs_to :message
  belongs_to :user
  # One hide per [message, user] is enforced by the unique index alone, not a uniqueness
  # validation, so HideService's create_or_find_by! can fall back to the existing row.
end
