class CreateMessages < ActiveRecord::Migration[8.1]
  def change
    create_table :messages do |t|
      t.references :conversation, null: false, foreign_key: true
      t.references :sender, null: false, foreign_key: { to_table: :users }
      t.text :body, null: false
      t.datetime :edited_at
      t.datetime :deleted_at
      t.timestamps
    end

    # Supports the keyset-pagination query (WHERE conversation_id = ? AND id < ? ORDER BY id DESC).
    add_index :messages, [ :conversation_id, :id ]
  end
end
