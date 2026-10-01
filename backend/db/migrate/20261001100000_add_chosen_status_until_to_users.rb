class AddChosenStatusUntilToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :chosen_status_until, :datetime
  end
end
