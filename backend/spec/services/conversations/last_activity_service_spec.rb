require "rails_helper"

RSpec.describe Conversations::LastActivityService do
  let(:alice) { create(:user) }
  let(:bob) { create(:user) }
  let(:conversation) { create(:conversation) }

  before do
    create(:conversation_membership, conversation: conversation, user: alice)
    create(:conversation_membership, conversation: conversation, user: bob)
  end

  it "is nil when the conversation has no messages" do
    expect(described_class.call(conversation, user: alice)).to be_nil
  end

  it "returns the latest message with its sender" do
    create(:message, conversation: conversation, sender: alice, body: "first")
    create(:message, conversation: conversation, sender: bob, body: "second")

    result = described_class.call(conversation, user: alice)

    expect(result).to include(type: "message", body: "second", deleted: false)
    expect(result[:actor][:id]).to eq(bob.id)
  end

  it "truncates a long body" do
    create(:message, conversation: conversation, sender: bob, body: "a" * 500)

    expect(described_class.call(conversation, user: alice)[:body].length).to eq(described_class::BODY_PREVIEW_LENGTH)
  end

  it "reports an unsent message without its body" do
    create(:message, conversation: conversation, sender: bob, body: "oops", deleted_at: Time.current)

    expect(described_class.call(conversation, user: alice)).to include(type: "message", deleted: true, body: nil)
  end

  it "skips messages the viewer unsent for themselves only" do
    create(:message, conversation: conversation, sender: bob, body: "visible")
    hidden = create(:message, conversation: conversation, sender: bob, body: "hidden")
    create(:message_hide, message: hidden, user: alice)

    expect(described_class.call(conversation, user: alice)[:body]).to eq("visible")
    expect(described_class.call(conversation, user: bob)[:body]).to eq("hidden")
  end

  it "returns a reaction newer than the latest message" do
    message = create(:message, conversation: conversation, sender: alice, created_at: 1.minute.ago)
    create(:message_reaction, message: message, user: bob, emoji: "❤️")

    result = described_class.call(conversation, user: alice)

    expect(result).to include(type: "reaction", emoji: "❤️", message_sender_id: alice.id)
    expect(result[:actor][:id]).to eq(bob.id)
  end

  it "prefers a message sent after the latest reaction" do
    reacted = create(:message, conversation: conversation, sender: alice, created_at: 2.minutes.ago)
    create(:message_reaction, message: reacted, user: bob, created_at: 1.minute.ago)
    create(:message, conversation: conversation, sender: bob, body: "later")

    expect(described_class.call(conversation, user: alice)).to include(type: "message", body: "later")
  end

  it "ignores reactions on unsent or hidden messages" do
    create(:message, conversation: conversation, sender: bob, body: "latest visible", created_at: 3.minutes.ago)
    unsent = create(:message, conversation: conversation, sender: alice, created_at: 2.minutes.ago, deleted_at: Time.current)
    create(:message_reaction, message: unsent, user: bob)
    hidden = create(:message, conversation: conversation, sender: bob, created_at: 2.minutes.ago)
    create(:message_hide, message: hidden, user: alice)
    create(:message_reaction, message: hidden, user: bob)

    expect(described_class.call(conversation, user: alice)).to include(type: "message", deleted: true)
  end
end
