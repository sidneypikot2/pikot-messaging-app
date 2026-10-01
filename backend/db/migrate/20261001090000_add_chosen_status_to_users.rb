class AddChosenStatusToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :chosen_status, :string, null: false, default: "online"
  end
end
