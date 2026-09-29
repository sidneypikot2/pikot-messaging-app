class CreateMessageHides < ActiveRecord::Migration[8.1]
  def change
    create_table :message_hides do |t|
      t.references :message, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.timestamps
    end

    add_index :message_hides, [ :message_id, :user_id ], unique: true
  end
end
