require "rails_helper"

RSpec.describe User, type: :model do
  it "is valid with matching password and password_confirmation" do
    user = build(:user)
    expect(user).to be_valid
  end

  it "requires password_confirmation on create" do
    user = build(:user, password_confirmation: nil)
    expect(user).not_to be_valid
    expect(user.errors[:password_confirmation]).to be_present
  end

  it "is invalid when password and password_confirmation don't match" do
    user = build(:user, password_confirmation: "something-else")
    expect(user).not_to be_valid
  end

  it "requires a password of at least 8 characters" do
    user = build(:user, password: "short", password_confirmation: "short")
    expect(user).not_to be_valid
  end

  it "downcases and strips email on save" do
    user = create(:user, email: "  Test@Example.com  ")
    expect(user.email).to eq("test@example.com")
  end

  it "requires a unique email, case-insensitively" do
    create(:user, email: "dup@example.com")
    dup = build(:user, email: "DUP@example.com")
    expect(dup).not_to be_valid
  end

  describe "#verified?" do
    it "is false without verified_at" do
      expect(build(:user, verified_at: nil).verified?).to be false
    end

    it "is true with verified_at" do
      expect(build(:user, :verified).verified?).to be true
    end
  end

  describe "email verification tokens" do
    it "resolves the user that generated the token" do
      user = create(:user)
      token = user.generate_token_for(:email_verification)
      expect(User.find_by_token_for(:email_verification, token)).to eq(user)
    end

    it "rejects a token after the email it was generated for changes" do
      user = create(:user)
      token = user.generate_token_for(:email_verification)
      user.update_column(:email, "changed@example.com")
      expect(User.find_by_token_for(:email_verification, token)).to be_nil
    end
  end
end
