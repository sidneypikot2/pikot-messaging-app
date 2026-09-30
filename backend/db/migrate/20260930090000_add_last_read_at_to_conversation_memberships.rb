class AddLastReadAtToConversationMemberships < ActiveRecord::Migration[8.1]
  def change
    add_column :conversation_memberships, :last_read_at, :datetime
  end
end
