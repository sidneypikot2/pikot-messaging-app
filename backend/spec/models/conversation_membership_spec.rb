require "rails_helper"

RSpec.describe ConversationMembership, type: :model do
  it "is valid with a unique user per conversation" do
    membership = build(:conversation_membership)
    expect(membership).to be_valid
  end

  it "rejects a duplicate user in the same conversation" do
    conversation = create(:conversation)
    user = create(:user)
    create(:conversation_membership, conversation: conversation, user: user)

    dup = build(:conversation_membership, conversation: conversation, user: user)
    expect(dup).not_to be_valid
  end

  it "allows the same user in different conversations" do
    user = create(:user)
    create(:conversation_membership, user: user)

    dup = build(:conversation_membership, user: user)
    expect(dup).to be_valid
  end
end
