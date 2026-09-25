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

  describe "profile fields" do
    it "requires first_name" do
      user = build(:user, first_name: nil)
      expect(user).not_to be_valid
      expect(user.errors[:first_name]).to be_present
    end

    it "requires last_name" do
      user = build(:user, last_name: nil)
      expect(user).not_to be_valid
      expect(user.errors[:last_name]).to be_present
    end

    it "requires a username" do
      user = build(:user, username: nil)
      expect(user).not_to be_valid
      expect(user.errors[:username]).to be_present
    end

    it "rejects a username with characters other than letters, numbers, and underscores" do
      user = build(:user, username: "bad name!")
      expect(user).not_to be_valid
    end

    it "requires a unique username, case-insensitively" do
      create(:user, username: "dupuser")
      dup = build(:user, username: "DupUser")
      expect(dup).not_to be_valid
    end

    it "preserves the username's casing as entered" do
      user = create(:user, username: "CamelCase")
      expect(user.username).to eq("CamelCase")
    end

    it "does not require first_name, last_name, or username for oauth users" do
      user = build(:user, :oauth)
      expect(user).to be_valid
    end
  end

  describe "avatar" do
    it "is valid without an avatar attached" do
      user = build(:user)
      expect(user).to be_valid
    end

    it "is valid with an allowed content type" do
      user = build(:user)
      user.avatar.attach(io: File.open(Rails.root.join("spec/fixtures/files/avatar.png")), filename: "avatar.png", content_type: "image/png")
      expect(user).to be_valid
    end

    it "rejects a disallowed content type" do
      user = build(:user)
      # identify: false — otherwise Active Storage sniffs the real bytes (a PNG) and
      # overrides whatever content_type we declare here.
      user.avatar.attach(io: File.open(Rails.root.join("spec/fixtures/files/avatar.png")), filename: "avatar.txt",
                          content_type: "text/plain", identify: false)
      expect(user).not_to be_valid
      expect(user.errors[:avatar]).to be_present
    end
  end

  describe "#verified?" do
    it "is false without verified_at" do
      expect(build(:user, verified_at: nil).verified?).to be false
    end

    it "is true with verified_at" do
      expect(build(:user, :verified).verified?).to be true
    end
  end

  describe "oauth users" do
    it "is valid with no password at all" do
      user = build(:user, :oauth)
      expect(user).to be_valid
    end

    it "is verified automatically" do
      expect(build(:user, :oauth).verified?).to be true
    end

    it "#oauth_user? is true when a provider is set" do
      expect(build(:user, :oauth).oauth_user?).to be true
    end

    it "#oauth_user? is false for a password-based user" do
      expect(build(:user).oauth_user?).to be false
    end

    it "still enforces a unique provider+uid pair" do
      create(:user, :oauth, provider: "facebook", uid: "dup-uid")
      dup = build(:user, :oauth, provider: "facebook", uid: "dup-uid")

      expect { dup.save!(validate: false) }.to raise_error(ActiveRecord::RecordNotUnique)
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
