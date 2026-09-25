require "rails_helper"

RSpec.describe Messages::DeleteService do
  it "soft-deletes the message when the sender owns it" do
    message = create(:message)

    deleted = described_class.call(message: message, sender: message.sender)

    expect(deleted.deleted_at).to be_present
    expect(Message.exists?(message.id)).to be true
  end

  it "raises when the caller is not the sender" do
    message = create(:message)
    other_user = create(:user)

    expect {
      described_class.call(message: message, sender: other_user)
    }.to raise_error(NotAuthorizedError)
  end
end
