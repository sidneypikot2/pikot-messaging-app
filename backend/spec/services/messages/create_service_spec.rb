require "rails_helper"

RSpec.describe Messages::CreateService do
  it "creates a message and broadcasts it when the sender is a member" do
    conversation = create(:conversation)
    sender = create(:user)
    create(:conversation_membership, conversation: conversation, user: sender)

    expect {
      described_class.call(conversation: conversation, sender: sender, body: "hi there")
    }.to change(Message, :count).by(1)
      .and have_broadcasted_to(conversation).from_channel(ConversationChannel)

    expect(conversation.messages.last.body).to eq("hi there")
  end

  it "also notifies every member's personal channel, not just the conversation channel" do
    conversation = create(:conversation)
    sender = create(:user)
    other = create(:user)
    create(:conversation_membership, conversation: conversation, user: sender)
    create(:conversation_membership, conversation: conversation, user: other)

    expect {
      described_class.call(conversation: conversation, sender: sender, body: "hi there")
    }.to have_broadcasted_to(sender).from_channel(NotificationsChannel)
      .and have_broadcasted_to(other).from_channel(NotificationsChannel)
  end

  it "raises when the sender is not a member of the conversation" do
    conversation = create(:conversation)
    sender = create(:user)

    expect {
      described_class.call(conversation: conversation, sender: sender, body: "hi there")
    }.to raise_error(NotAuthorizedError)
  end
end
