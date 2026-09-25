require "rails_helper"

RSpec.describe Conversation, type: :model do
  it "has many members through conversation_memberships" do
    conversation = create(:conversation)
    alice = create(:user)
    bob = create(:user)
    create(:conversation_membership, conversation: conversation, user: alice)
    create(:conversation_membership, conversation: conversation, user: bob)

    expect(conversation.members).to contain_exactly(alice, bob)
  end

  it "destroys its memberships and messages when destroyed" do
    conversation = create(:conversation)
    create(:conversation_membership, conversation: conversation)
    create(:message, conversation: conversation)

    expect {
      conversation.destroy
    }.to change(ConversationMembership, :count).by(-1).and change(Message, :count).by(-1)
  end
end
