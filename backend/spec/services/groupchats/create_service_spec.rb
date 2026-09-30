require "rails_helper"

RSpec.describe Groupchats::CreateService do
  let(:alice) { create(:user) }
  let(:bob) { create(:user) }
  let(:carol) { create(:user) }

  it "creates a named group with the owner and every given member" do
    conversation = described_class.call(owner: alice, name: "  Weekend trip  ", member_ids: [ bob.id, carol.id ])

    expect(conversation).to be_persisted.and have_attributes(kind: "group", name: "Weekend trip", owner: alice)
    expect(conversation.members).to contain_exactly(alice, bob, carol)
  end

  it "ignores the owner and duplicates in member_ids" do
    conversation = described_class.call(owner: alice, name: "Trip", member_ids: [ alice.id, bob.id, bob.id, carol.id ])

    expect(conversation.conversation_memberships.count).to eq(3)
  end

  it "tells every member about the new group on their own notifications channel" do
    [ alice, bob, carol ].each do |member|
      expect {
        described_class.call(owner: alice, name: "Trip", member_ids: [ bob.id, carol.id ])
      }.to have_broadcasted_to(member).from_channel(NotificationsChannel).with(
        hash_including(event: "conversation_created", conversation: hash_including(kind: "group", name: "Trip"))
      )
    end
  end

  it "requires a name" do
    expect {
      described_class.call(owner: alice, name: "   ", member_ids: [ bob.id, carol.id ])
    }.to raise_error(ActiveRecord::RecordInvalid, /Name can't be blank/)
  end

  it "rejects a name over the maximum length" do
    expect {
      described_class.call(owner: alice, name: "a" * (Conversation::NAME_MAX_LENGTH + 1), member_ids: [ bob.id, carol.id ])
    }.to raise_error(ActiveRecord::RecordInvalid, /Name is too long/)
  end

  it "requires at least two other people" do
    expect {
      described_class.call(owner: alice, name: "Trip", member_ids: [ bob.id ])
    }.to raise_error(ActiveRecord::RecordInvalid, /at least 2 people/)
    expect(Conversation.count).to eq(0)
  end

  it "rejects member ids that don't belong to a user" do
    expect {
      described_class.call(owner: alice, name: "Trip", member_ids: [ bob.id, 0 ])
    }.to raise_error(ActiveRecord::RecordInvalid, /don't exist/)
  end
end
