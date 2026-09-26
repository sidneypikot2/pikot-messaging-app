class AddLastReadMessageIdToConversationMemberships < ActiveRecord::Migration[8.1]
  def change
    # Nullable — nil means this member has never marked anything read, so every message
    # not sent by them counts as unread.
    add_reference :conversation_memberships, :last_read_message, foreign_key: { to_table: :messages }
  end
end
