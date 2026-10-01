module Conversations
  # Sets (or, when blank, clears) a member's nickname in this chat (KAN-41). Any member
  # can nickname anyone in it, themselves included, and everyone in the chat sees it.
  class NicknameService < ApplicationService
    def initialize(conversation:, user:, member_id:, nickname:)
      @conversation = conversation
      @user = user
      @member_id = member_id
      @nickname = nickname
    end

    def call
      raise NotAuthorizedError, "not a member of this conversation" unless @conversation.member?(@user)

      membership = @conversation.conversation_memberships.includes(:user).find_by!(user_id: @member_id)
      membership.nickname = @nickname.to_s
      return membership unless membership.nickname_changed?

      membership.save!
      SystemMessageService.call(conversation: @conversation, actor: @user, event: {
        type: "nickname", nickname: membership.nickname,
        target: { id: membership.user.id, name: membership.user.display_name }
      })
      Broadcaster.call(@conversation)
      membership
    end
  end
end
