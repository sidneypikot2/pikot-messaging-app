class AddGroupFieldsToConversations < ActiveRecord::Migration[8.1]
  def change
    add_column :conversations, :kind, :integer, null: false, default: 0
    add_column :conversations, :name, :string
    add_reference :conversations, :owner, foreign_key: { to_table: :users }
  end
end
