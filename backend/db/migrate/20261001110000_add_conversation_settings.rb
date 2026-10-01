# Conversation settings (KAN-41): a chat theme for everyone, a nickname per member, and
# per-viewer mute and "delete chat for you" on the membership; system messages carry the
# grey "Alice renamed the group" lines.
class AddConversationSettings < ActiveRecord::Migration[8.1]
  def change
    add_column :conversations, :theme, :string

    add_column :conversation_memberships, :nickname, :string
    add_column :conversation_memberships, :muted_until, :datetime
    add_column :conversation_memberships, :cleared_message_id, :bigint

    add_column :messages, :kind, :integer, default: 0, null: false
    add_column :messages, :system_event, :jsonb
  end
end
