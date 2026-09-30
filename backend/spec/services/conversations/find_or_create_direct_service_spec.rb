require "rails_helper"

RSpec.describe Conversations::FindOrCreateDirectService do
  it "creates a new conversation with both users as members" do
    alice = create(:user)
    bob = create(:user)

    conversation = described_class.call(current_user: alice, other_user_id: bob.id)

    expect(conversation).to be_persisted
    expect(conversation.members).to contain_exactly(alice, bob)
  end

  it "reuses the existing conversation instead of creating a duplicate" do
    alice = create(:user)
    bob = create(:user)
    existing = described_class.call(current_user: alice, other_user_id: bob.id)

    expect {
      described_class.call(current_user: bob, other_user_id: alice.id)
    }.not_to change(Conversation, :count)

    expect(described_class.call(current_user: alice, other_user_id: bob.id)).to eq(existing)
  end

  it "raises when starting a conversation with yourself" do
    alice = create(:user)

    expect {
      described_class.call(current_user: alice, other_user_id: alice.id)
    }.to raise_error(ArgumentError)
  end

  it "starts a direct conversation even when the two people already share a group" do
    alice, bob, carol = create_list(:user, 3)
    group = Groupchats::CreateService.call(owner: alice, name: "Trip", member_ids: [ bob.id, carol.id ])

    conversation = described_class.call(current_user: alice, other_user_id: bob.id)

    expect(conversation).not_to eq(group)
    expect(conversation).to be_direct
    expect(conversation.members).to contain_exactly(alice, bob)
  end
end
