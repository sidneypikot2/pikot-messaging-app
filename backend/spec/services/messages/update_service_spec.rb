require "rails_helper"

RSpec.describe Messages::UpdateService do
  it "updates the body and sets edited_at when the sender owns the message" do
    message = create(:message, body: "original")

    updated = described_class.call(message: message, sender: message.sender, body: "edited")

    expect(updated.body).to eq("edited")
    expect(updated.edited_at).to be_present
  end

  it "notifies every conversation member's personal channel" do
    conversation = create(:conversation)
    sender = create(:user)
    other = create(:user)
    create(:conversation_membership, conversation: conversation, user: sender)
    create(:conversation_membership, conversation: conversation, user: other)
    message = create(:message, conversation: conversation, sender: sender)

    expect {
      described_class.call(message: message, sender: sender, body: "edited")
    }.to have_broadcasted_to(sender).from_channel(NotificationsChannel)
      .and have_broadcasted_to(other).from_channel(NotificationsChannel)
  end

  it "raises when the caller is not the sender" do
    message = create(:message)
    other_user = create(:user)

    expect {
      described_class.call(message: message, sender: other_user, body: "edited")
    }.to raise_error(NotAuthorizedError)
  end
end
