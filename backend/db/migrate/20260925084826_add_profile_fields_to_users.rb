class AddProfileFieldsToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :first_name, :string
    add_column :users, :last_name, :string
    add_column :users, :username, :string

    # Case-insensitive uniqueness without forcing storage lowercase (unlike email's
    # `normalizes`) — username is user-facing display text, so the casing someone
    # picks at signup should be preserved.
    add_index :users, "LOWER(username)", unique: true, name: "index_users_on_lower_username"
  end
end
