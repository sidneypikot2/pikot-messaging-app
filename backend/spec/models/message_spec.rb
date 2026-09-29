require "rails_helper"

RSpec.describe Message, type: :model do
  it "is valid with a body" do
    expect(build(:message)).to be_valid
  end

  it "requires a body" do
    message = build(:message, body: nil)
    expect(message).not_to be_valid
  end

  it "rejects a body over 5000 characters" do
    message = build(:message, body: "a" * 5001)
    expect(message).not_to be_valid
  end

  describe "reply_to_message" do
    let(:original) { create(:message) }

    it "is valid replying to a message in the same conversation" do
      expect(build(:message, conversation: original.conversation, reply_to_message: original)).to be_valid
    end

    it "rejects replying to a message in another conversation" do
      reply = build(:message, reply_to_message: original)
      expect(reply).not_to be_valid
      expect(reply.errors[:reply_to_message]).to include("must be in the same conversation")
    end

    it "rejects replying to a deleted message" do
      original.update!(deleted_at: Time.current)
      reply = build(:message, conversation: original.conversation, reply_to_message: original)
      expect(reply).not_to be_valid
      expect(reply.errors[:reply_to_message]).to include("has been deleted")
    end

    it "rejects a reply_to_message_id that doesn't exist" do
      reply = build(:message, reply_to_message_id: 0)
      expect(reply).not_to be_valid
      expect(reply.errors[:reply_to_message]).to include("must exist")
    end

    it "keeps an existing reply valid after the original is deleted" do
      reply = create(:message, conversation: original.conversation, reply_to_message: original)
      original.update!(deleted_at: Time.current)
      expect(reply.reload).to be_valid
    end
  end

  describe "#deleted?" do
    it "is false without deleted_at" do
      expect(build(:message).deleted?).to be false
    end

    it "is true with deleted_at" do
      expect(build(:message, deleted_at: Time.current).deleted?).to be true
    end
  end

  describe "#edited?" do
    it "is false without edited_at" do
      expect(build(:message).edited?).to be false
    end

    it "is true with edited_at" do
      expect(build(:message, edited_at: Time.current).edited?).to be true
    end
  end
end
