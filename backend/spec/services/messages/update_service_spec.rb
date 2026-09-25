require "rails_helper"

RSpec.describe Messages::UpdateService do
  it "updates the body and sets edited_at when the sender owns the message" do
    message = create(:message, body: "original")

    updated = described_class.call(message: message, sender: message.sender, body: "edited")

    expect(updated.body).to eq("edited")
    expect(updated.edited_at).to be_present
  end

  it "raises when the caller is not the sender" do
    message = create(:message)
    other_user = create(:user)

    expect {
      described_class.call(message: message, sender: other_user, body: "edited")
    }.to raise_error(NotAuthorizedError)
  end
end
