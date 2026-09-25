require "rails_helper"

RSpec.describe MessageSerializer do
  it "returns the message's fields including sender" do
    message = create(:message, body: "hello")

    result = described_class.call(message)

    expect(result).to include(
      id: message.id, conversation_id: message.conversation_id, body: "hello",
      deleted: false, edited: false
    )
    expect(result[:sender][:id]).to eq(message.sender.id)
  end

  it "hides the body and reports deleted: true for a soft-deleted message" do
    message = create(:message, deleted_at: Time.current)

    result = described_class.call(message)

    expect(result[:body]).to be_nil
    expect(result[:deleted]).to be true
  end

  it "reports edited: true once edited_at is set" do
    message = create(:message, edited_at: Time.current)

    expect(described_class.call(message)[:edited]).to be true
  end
end
