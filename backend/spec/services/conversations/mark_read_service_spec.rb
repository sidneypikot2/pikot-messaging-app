require "rails_helper"

RSpec.describe Conversations::MarkReadService do
  include ActiveSupport::Testing::TimeHelpers

  let(:alice) { create(:user) }
  let(:bob) { create(:user) }
  let(:conversation) { create(:conversation) }
  let!(:bob_membership) { create(:conversation_membership, conversation: conversation, user: bob) }

  before { create(:conversation_membership, conversation: conversation, user: alice) }

  it "moves the reader's marker to the latest message and broadcasts a read event" do
    create(:message, conversation: conversation, sender: alice)
    latest = create(:message, conversation: conversation, sender: alice)
    freeze_time

    expect {
      described_class.call(conversation: conversation, user: bob)
    }.to have_broadcasted_to(conversation).from_channel(ConversationChannel).with(
      hash_including(event: "read", conversation_id: conversation.id, last_read_message_id: latest.id,
                     last_read_at: Time.current, user: hash_including(id: bob.id))
    )
    expect(bob_membership.reload).to have_attributes(last_read_message_id: latest.id, last_read_at: Time.current)
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

  it "tracks each group member's marker separately" do
    carol = create(:user)
    group = Groupchats::CreateService.call(owner: alice, name: "Trip", member_ids: [ bob.id, carol.id ])
    first = create(:message, conversation: group, sender: alice)
    described_class.call(conversation: group, user: bob)
    create(:message, conversation: group, sender: alice)

    expect {
      described_class.call(conversation: group, user: carol)
    }.to have_broadcasted_to(group).from_channel(ConversationChannel).with(hash_including(event: "read", user: hash_including(id: carol.id)))
    expect(group.conversation_memberships.find_by!(user: bob).last_read_message_id).to eq(first.id)
    expect(group.conversation_memberships.find_by!(user: carol).last_read_message_id).to eq(group.messages.maximum(:id))
  end
end
