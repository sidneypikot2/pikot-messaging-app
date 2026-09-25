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

  it "raises when the sender is not a member of the conversation" do
    conversation = create(:conversation)
    sender = create(:user)

    expect {
      described_class.call(conversation: conversation, sender: sender, body: "hi there")
    }.to raise_error(NotAuthorizedError)
  end
end
