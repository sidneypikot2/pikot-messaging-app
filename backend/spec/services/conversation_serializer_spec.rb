require "rails_helper"

RSpec.describe ConversationSerializer do
  it "returns the other member's serialized info" do
    alice = create(:user)
    bob = create(:user)
    conversation = create(:conversation)
    create(:conversation_membership, conversation: conversation, user: alice)
    create(:conversation_membership, conversation: conversation, user: bob)

    result = described_class.call(conversation, current_user: alice)

    expect(result[:id]).to eq(conversation.id)
    expect(result[:other_user][:id]).to eq(bob.id)
  end
end
