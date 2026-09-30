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

  it "defaults unread_count to 0 when not given" do
    conversation = create(:conversation)
    create(:conversation_membership, conversation: conversation, user: create(:user))

    result = described_class.call(conversation, current_user: create(:user))

    expect(result[:unread_count]).to eq(0)
  end

  it "includes the given unread_count" do
    conversation = create(:conversation)
    create(:conversation_membership, conversation: conversation, user: create(:user))

    result = described_class.call(conversation, current_user: create(:user), unread_count: 5)

    expect(result[:unread_count]).to eq(5)
  end

  it "lists how far each other member has read, excluding the current user" do
    alice = create(:user)
    bob = create(:user)
    conversation = create(:conversation)
    message = create(:message, conversation: conversation, sender: alice)
    create(:conversation_membership, conversation: conversation, user: alice, last_read_message_id: message.id)
    create(:conversation_membership, conversation: conversation, user: bob, last_read_message_id: message.id)

    result = described_class.call(conversation, current_user: alice)

    expect(result[:read_receipts]).to contain_exactly(hash_including(last_read_message_id: message.id, user: hash_including(id: bob.id)))
  end
end
