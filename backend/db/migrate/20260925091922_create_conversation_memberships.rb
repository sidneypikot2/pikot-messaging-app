class CreateConversationMemberships < ActiveRecord::Migration[8.1]
  def change
    create_table :conversation_memberships do |t|
      t.references :conversation, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.timestamps
    end

    add_index :conversation_memberships, [ :conversation_id, :user_id ], unique: true
  end
end
