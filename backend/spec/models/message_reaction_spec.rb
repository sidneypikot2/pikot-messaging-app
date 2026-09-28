require "rails_helper"

RSpec.describe MessageReaction, type: :model do
  it "is valid with a message, user, and emoji" do
    expect(build(:message_reaction)).to be_valid
  end

  it "requires an emoji" do
    reaction = build(:message_reaction, emoji: nil)
    expect(reaction).not_to be_valid
  end

  it "prevents the same user reacting with the same emoji twice on the same message" do
    message = create(:message)
    user = create(:user)
    create(:message_reaction, message: message, user: user, emoji: "👍")
    duplicate = build(:message_reaction, message: message, user: user, emoji: "👍")

    expect(duplicate).not_to be_valid
  end

  it "allows the same user to react with a different emoji on the same message" do
    message = create(:message)
    user = create(:user)
    create(:message_reaction, message: message, user: user, emoji: "👍")
    other_emoji = build(:message_reaction, message: message, user: user, emoji: "❤️")

    expect(other_emoji).to be_valid
  end
end
