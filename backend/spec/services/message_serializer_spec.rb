require "rails_helper"

RSpec.describe MessageSerializer do
  it "returns the message's fields including sender" do
    message = create(:message, body: "hello")

    result = described_class.call(message, current_user: message.sender)

    expect(result).to include(
      id: message.id, conversation_id: message.conversation_id, body: "hello",
      deleted: false, edited: false, reactions: []
    )
    expect(result[:sender][:id]).to eq(message.sender.id)
  end

  it "hides the body and reports deleted: true for a soft-deleted message" do
    message = create(:message, deleted_at: Time.current)

    result = described_class.call(message, current_user: message.sender)

    expect(result[:body]).to be_nil
    expect(result[:deleted]).to be true
  end

  it "reports edited: true once edited_at is set" do
    message = create(:message, edited_at: Time.current)

    expect(described_class.call(message, current_user: message.sender)[:edited]).to be true
  end

  it "groups reactions and reports reacted_by_me relative to the given current_user" do
    message = create(:message)
    reactor = create(:user)
    other = create(:user)
    create(:message_reaction, message: message, user: reactor, emoji: "👍")
    create(:message_reaction, message: message, user: other, emoji: "👍")

    reactions = described_class.call(message, current_user: reactor)[:reactions]

    expect(reactions).to eq([ { emoji: "👍", count: 2, reacted_by_me: true } ])
    expect(described_class.call(message, current_user: create(:user))[:reactions].first[:reacted_by_me]).to be false
  end
end
