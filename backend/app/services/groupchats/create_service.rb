module Groupchats
  # Creates a named group chat with the owner plus the given members (KAN-35). Members are
  # added directly for now; invitations needing the invitee's approval come later.
  class CreateService < ApplicationService
    MIN_OTHER_MEMBERS = 2

    def initialize(owner:, name:, member_ids:)
      @owner = owner
      @name = name
      @member_ids = Array(member_ids).map(&:to_i).uniq - [ owner.id ]
    end

    def call
      conversation = Conversation.new(kind: :group, name: @name, owner: @owner)
      members = User.active.where(id: @member_ids).to_a
      validate_members!(conversation, members)

      ActiveRecord::Base.transaction do
        conversation.save!
        [ @owner, *members ].each { |user| conversation.conversation_memberships.create!(user: user) }
      end
      broadcast_created(conversation)
      conversation
    end

    private

    def validate_members!(conversation, members)
      conversation.validate
      conversation.errors.add(:base, "Add at least #{MIN_OTHER_MEMBERS} people to the group") if @member_ids.size < MIN_OTHER_MEMBERS
      conversation.errors.add(:base, "Some of those people don't exist") if members.size != @member_ids.size
      raise ActiveRecord::RecordInvalid, conversation if conversation.errors.any?
    end

    # Serialized per member since last_activity and read_receipts are viewer-relative.
    def broadcast_created(conversation)
      conversation.members.each do |member|
        NotificationsChannel.broadcast_to(member, event: "conversation_created",
                                                  conversation: ConversationSerializer.call(conversation, current_user: member))
      end
    end
  end
end
