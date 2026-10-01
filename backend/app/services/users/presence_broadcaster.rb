module Users
  # Tells everyone who shares a conversation with `user` that they came online or went
  # offline (KAN-39), so their dot and "Active 5m ago" update without a refetch.
  class PresenceBroadcaster < ApplicationService
    def initialize(user)
      @user = user
    end

    def call
      payload = { event: "presence", user_id: @user.id, online: Presence.online?(@user.id), last_seen_at: @user.last_seen_at }
      contacts.find_each { |contact| NotificationsChannel.broadcast_to(contact, payload) }
    end

    private

    def contacts
      User.where(id: ConversationMembership.where(conversation_id: @user.conversation_memberships.select(:conversation_id))
                                           .where.not(user_id: @user.id).select(:user_id))
    end
  end
end
