require "rails_helper"

RSpec.describe Reactions::ToggleService do
  let(:conversation) { create(:conversation) }
  let(:sender) { create(:user) }
  let(:message) { create(:message, conversation: conversation) }

  before { create(:conversation_membership, conversation: conversation, user: sender) }

  it "adds a reaction and broadcasts reaction_added when none exists yet" do
    expect {
      described_class.call(message: message, user: sender, emoji: "👍")
    }.to change(MessageReaction, :count).by(1)
      .and have_broadcasted_to(conversation).from_channel(ConversationChannel)
      .and have_broadcasted_to(sender).from_channel(NotificationsChannel)
  end

  it "tells the message's author whose message it was and who reacted" do
    expect {
      described_class.call(message: message, user: sender, emoji: "👍")
    }.to have_broadcasted_to(sender).from_channel(NotificationsChannel).with(
      a_hash_including(event: "reaction_added", message_sender_id: message.sender_id,
                       user: a_hash_including(id: sender.id))
    )
  end

  it "removes the reaction and broadcasts reaction_removed on a second toggle of the same emoji" do
    described_class.call(message: message, user: sender, emoji: "👍")

    expect {
      described_class.call(message: message, user: sender, emoji: "👍")
    }.to change(MessageReaction, :count).by(-1)
      .and have_broadcasted_to(conversation).from_channel(ConversationChannel)
  end

  it "raises when the user is not a member of the conversation" do
    outsider = create(:user)

    expect {
      described_class.call(message: message, user: outsider, emoji: "👍")
    }.to raise_error(NotAuthorizedError)
  end
end
