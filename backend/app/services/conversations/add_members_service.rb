module Conversations
  # Adds people to a group chat (KAN-41). Any member can, as in Messenger; the new
  # members see the group appear in their list and everyone else sees who joined.
  class AddMembersService < ApplicationService
    def initialize(conversation:, user:, member_ids:)
      @conversation = conversation
      @user = user
      @member_ids = Array(member_ids).map(&:to_i).uniq
    end

    def call
      raise NotAuthorizedError, "not a member of this conversation" unless @conversation.member?(@user)
      raise NotAuthorizedError, "only group chats can have people added" unless @conversation.group?

      new_members = User.active.where(id: @member_ids).where.not(id: @conversation.conversation_memberships.select(:user_id)).to_a
      validate!(new_members)

      existing_members = @conversation.members.to_a
      ActiveRecord::Base.transaction do
        new_members.each { |member| @conversation.conversation_memberships.create!(user: member) }
      end
      SystemMessageService.call(conversation: @conversation, actor: @user, event: {
        type: "added", targets: new_members.map { |member| { id: member.id, name: member.display_name } }
      })
      Broadcaster.call(@conversation, users: existing_members)
      Broadcaster.call(@conversation, event: "conversation_created", users: new_members)
      @conversation
    end

    private

    def validate!(new_members)
      return if new_members.any?

      @conversation.errors.add(:base, "Pick at least one person who isn't in the group yet")
      raise ActiveRecord::RecordInvalid, @conversation
    end
  end
end
