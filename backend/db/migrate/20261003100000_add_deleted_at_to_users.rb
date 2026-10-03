# Account deletion (KAN-63): a deleted account keeps its row, scrubbed of everything
# personal, so the messages it sent stay in other people's chats as "PikotChat user".
class AddDeletedAtToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :deleted_at, :datetime
  end
end
