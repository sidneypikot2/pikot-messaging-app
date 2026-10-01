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
    read_at = 5.minutes.ago.change(usec: 0)
    create(:conversation_membership, conversation: conversation, user: bob, last_read_message_id: message.id, last_read_at: read_at)

    result = described_class.call(conversation, current_user: alice)

    expect(result[:read_receipts]).to contain_exactly(hash_including(last_read_message_id: message.id, last_read_at: read_at, user: hash_including(id: bob.id)))
  end

  it "describes a group by kind, name and members, with no other_user" do
    alice, bob, carol = create_list(:user, 3)
    group = Groupchats::CreateService.call(owner: alice, name: "Trip", member_ids: [ bob.id, carol.id ])

    result = described_class.call(group, current_user: alice)

    expect(result).to include(kind: "group", name: "Trip", other_user: nil)
    expect(result[:members].map { |m| m[:id] }).to eq([ alice.id, bob.id, carol.id ])
    expect(result[:read_receipts].map { |r| r[:user][:id] }).to contain_exactly(bob.id, carol.id)
  end

  it "marks a direct conversation as direct" do
    alice = create(:user)
    conversation = create(:conversation)
    create(:conversation_membership, conversation: conversation, user: alice)

    expect(described_class.call(conversation, current_user: alice)).to include(kind: "direct", name: nil)
  end

  it "includes whether each other member is online and when they were last seen (KAN-39)" do
    alice = create(:user)
    bob = create(:user, last_seen_at: 5.minutes.ago.change(usec: 0))
    carol = create(:user)
    conversation = create(:conversation)
    [ alice, bob, carol ].each { |user| create(:conversation_membership, conversation: conversation, user: user) }
    Presence.connect(carol.id, "tab")

    result = described_class.call(conversation, current_user: alice)

    expect(result[:presence]).to contain_exactly(
      { user_id: bob.id, online: false, last_seen_at: bob.last_seen_at },
      { user_id: carol.id, online: true, last_seen_at: nil }
    )
  end
end
