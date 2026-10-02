# Pinned note (KAN-44): one shared, editable note per chat for addresses, plans and
# links, plus who last edited it and when.
class AddPinnedNoteToConversations < ActiveRecord::Migration[8.1]
  def change
    add_column :conversations, :note, :text
    add_reference :conversations, :note_updated_by, foreign_key: { to_table: :users, on_delete: :nullify }
    add_column :conversations, :note_updated_at, :datetime
  end
end
