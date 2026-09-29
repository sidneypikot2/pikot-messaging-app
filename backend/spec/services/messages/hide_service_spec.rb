require "rails_helper"

RSpec.describe Messages::HideService do
  let(:conversation) { create(:conversation) }
  let(:user) { create(:user) }
  let(:other) { create(:user) }
  let(:message) { create(:message, conversation: conversation, sender: user) }

  before do
    create(:conversation_membership, conversation: conversation, user: user)
    create(:conversation_membership, conversation: conversation, user: other)
  end

  it "hides the message for the user without deleting it" do
    described_class.call(message: message, user: user)

    expect(message.hidden_for?(user)).to be true
    expect(message.hidden_for?(other)).to be false
    expect(message.reload.deleted_at).to be_nil
  end

  it "is idempotent" do
    described_class.call(message: message, user: user)

    expect {
      described_class.call(message: message, user: user)
    }.not_to change(MessageHide, :count)
  end

  it "lets a member hide someone else's message" do
    described_class.call(message: message, user: other)

    expect(message.hidden_for?(other)).to be true
  end

  it "notifies only the hiding user's personal channel" do
    expect {
      described_class.call(message: message, user: user)
    }.to have_broadcasted_to(user).from_channel(NotificationsChannel)
      .with(event: "message_hidden", message_id: message.id, conversation_id: conversation.id)

    expect {
      described_class.call(message: message, user: user)
    }.not_to have_broadcasted_to(other).from_channel(NotificationsChannel)
  end

  it "raises when the caller is not a member of the conversation" do
    expect {
      described_class.call(message: message, user: create(:user))
    }.to raise_error(NotAuthorizedError)
  end
end
