require "rails_helper"

RSpec.describe ConversationChannel, type: :channel do
  it "subscribes an active member" do
    conversation = create(:conversation)
    user = create(:user)
    create(:conversation_membership, conversation: conversation, user: user)
    stub_connection current_user: user

    subscribe(conversation_id: conversation.id)

    expect(subscription).to be_confirmed
    expect(subscription).to have_stream_for(conversation)
  end

  it "rejects a non-member" do
    conversation = create(:conversation)
    user = create(:user)
    stub_connection current_user: user

    subscribe(conversation_id: conversation.id)

    expect(subscription).to be_rejected
  end

  it "rejects a conversation that doesn't exist" do
    user = create(:user)
    stub_connection current_user: user

    subscribe(conversation_id: -1)

    expect(subscription).to be_rejected
  end

  describe "#typing" do
    it "broadcasts to the conversation when performed by a member" do
      conversation = create(:conversation)
      user = create(:user)
      create(:conversation_membership, conversation: conversation, user: user)
      stub_connection current_user: user
      subscribe(conversation_id: conversation.id)

      expect {
        perform :typing
      }.to have_broadcasted_to(conversation).with(event: "typing", user: UserSerializer.call(user))
    end

    it "does not broadcast if the member's membership was removed after subscribing" do
      conversation = create(:conversation)
      user = create(:user)
      membership = create(:conversation_membership, conversation: conversation, user: user)
      stub_connection current_user: user
      subscribe(conversation_id: conversation.id)
      membership.destroy!

      expect {
        perform :typing
      }.not_to have_broadcasted_to(conversation)
    end
  end
end
