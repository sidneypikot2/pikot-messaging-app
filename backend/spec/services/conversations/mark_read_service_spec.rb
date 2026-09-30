require "rails_helper"

RSpec.describe Conversations::MarkReadService do
  let(:alice) { create(:user) }
  let(:bob) { create(:user) }
  let(:conversation) { create(:conversation) }
  let!(:bob_membership) { create(:conversation_membership, conversation: conversation, user: bob) }

  before { create(:conversation_membership, conversation: conversation, user: alice) }

  it "moves the reader's marker to the latest message and broadcasts a read event" do
    create(:message, conversation: conversation, sender: alice)
    latest = create(:message, conversation: conversation, sender: alice)

    expect {
      described_class.call(conversation: conversation, user: bob)
    }.to have_broadcasted_to(conversation).from_channel(ConversationChannel).with(
      hash_including(event: "read", conversation_id: conversation.id, last_read_message_id: latest.id,
                     user: hash_including(id: bob.id))
    )
    expect(bob_membership.reload.last_read_message_id).to eq(latest.id)
  end

  it "does not broadcast when the marker is already at the latest message" do
    latest = create(:message, conversation: conversation, sender: alice)
    bob_membership.update!(last_read_message_id: latest.id)

    expect {
      described_class.call(conversation: conversation, user: bob)
    }.not_to have_broadcasted_to(conversation).from_channel(ConversationChannel)
  end

  it "does nothing for a conversation with no messages" do
    expect {
      described_class.call(conversation: conversation, user: bob)
    }.not_to have_broadcasted_to(conversation).from_channel(ConversationChannel)
    expect(bob_membership.reload.last_read_message_id).to be_nil
  end
end
