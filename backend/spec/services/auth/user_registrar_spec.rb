require "rails_helper"

RSpec.describe Auth::UserRegistrar do
  it "creates an unverified user and sends a verification email" do
    expect {
      @user = described_class.call(email: "new@example.com", password: "password123", password_confirmation: "password123")
    }.to change(User, :count).by(1).and change(ActionMailer::Base.deliveries, :count).by(1)

    expect(@user).to be_persisted
    expect(@user).not_to be_verified
  end

  it "returns an unsaved user with errors when password_confirmation doesn't match" do
    user = described_class.call(email: "new@example.com", password: "password123", password_confirmation: "different")

    expect(user).not_to be_persisted
    expect(user.errors[:password_confirmation]).to be_present
  end

  it "does not send an email when the user isn't saved" do
    expect {
      described_class.call(email: "new@example.com", password: "password123", password_confirmation: "different")
    }.not_to change(ActionMailer::Base.deliveries, :count)
  end
end
