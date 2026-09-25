require "rails_helper"

RSpec.describe Auth::UserRegistrar do
  let(:valid_params) do
    { email: "new@example.com", password: "password123", password_confirmation: "password123",
      first_name: "New", last_name: "User", username: "newuser" }
  end

  it "creates an unverified user and sends a verification email" do
    expect {
      @user = described_class.call(**valid_params)
    }.to change(User, :count).by(1).and change(ActionMailer::Base.deliveries, :count).by(1)

    expect(@user).to be_persisted
    expect(@user).not_to be_verified
    expect(@user.username).to eq("newuser")
  end

  it "returns an unsaved user with errors when password_confirmation doesn't match" do
    user = described_class.call(**valid_params, password_confirmation: "different")

    expect(user).not_to be_persisted
    expect(user.errors[:password_confirmation]).to be_present
  end

  it "returns an unsaved user with errors when the username is already taken" do
    create(:user, username: "takenname")
    user = described_class.call(**valid_params, username: "TakenName")

    expect(user).not_to be_persisted
    expect(user.errors[:username]).to be_present
  end

  it "returns an unsaved user with errors when first_name is missing" do
    user = described_class.call(**valid_params, first_name: nil)

    expect(user).not_to be_persisted
    expect(user.errors[:first_name]).to be_present
  end

  it "does not send an email when the user isn't saved" do
    expect {
      described_class.call(**valid_params, password_confirmation: "different")
    }.not_to change(ActionMailer::Base.deliveries, :count)
  end
end
