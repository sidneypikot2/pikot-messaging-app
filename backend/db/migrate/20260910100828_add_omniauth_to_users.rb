class AddOmniauthToUsers < ActiveRecord::Migration[8.1]
  def change
    # Social-login users have no password.
    change_column_null :users, :password_digest, true

    add_column :users, :provider, :string
    add_column :users, :uid, :string
    add_index :users, [ :provider, :uid ], unique: true
  end
end
