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
end
