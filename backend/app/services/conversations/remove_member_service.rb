module Conversations
  # Takes someone out of a group chat (KAN-41): yourself ("Leave group"), or anyone else
  # if you're the group's owner. An owner who leaves hands the group to whoever has been
  # in it longest; the last person out takes the group with them.
  class RemoveMemberService < ApplicationService
    def initialize(conversation:, user:, member_id:)
      @conversation = conversation
      @user = user
      @member_id = member_id.to_i
    end

    def call
      raise NotAuthorizedError, "not a member of this conversation" unless @conversation.member?(@user)
      raise NotAuthorizedError, "only group chats have members to remove" unless @conversation.group?

      leaving = @member_id == @user.id
      raise NotAuthorizedError, "only the group's owner can remove people" unless leaving || @conversation.owner_id == @user.id

      membership = @conversation.conversation_memberships.includes(:user).find_by!(user_id: @member_id)
      removed = membership.user
      # Posted while they're still a member, so their own tabs get the line too.
      SystemMessageService.call(conversation: @conversation, actor: @user, event: leaving ? { type: "left" } : {
        type: "removed", target: { id: removed.id, name: removed.display_name }
      })
      membership.destroy!
      NotificationsChannel.broadcast_to(removed, event: "conversation_removed", conversation_id: @conversation.id)
      settle_ownership
      @conversation
    end

    private

    def settle_ownership
      remaining = @conversation.conversation_memberships.order(:id)
      return @conversation.destroy! if remaining.none?

      @conversation.update!(owner_id: remaining.first.user_id) unless remaining.exists?(user_id: @conversation.owner_id)
      Broadcaster.call(@conversation)
    end
  end
end
