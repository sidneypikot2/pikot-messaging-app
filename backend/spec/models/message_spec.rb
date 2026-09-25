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
