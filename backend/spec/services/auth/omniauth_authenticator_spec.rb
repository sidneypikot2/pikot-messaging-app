require "rails_helper"

RSpec.describe Auth::OmniauthAuthenticator do
  def auth_hash(provider: "facebook", uid: "12345", email: "person@example.com")
    OmniAuth::AuthHash.new(
      provider: provider,
      uid: uid,
      info: OmniAuth::AuthHash::InfoHash.new(email: email)
    )
  end

  it "creates a new, verified user on first sign-in" do
    user = described_class.call(auth_hash)

    expect(user).to be_persisted
    expect(user.provider).to eq("facebook")
    expect(user.uid).to eq("12345")
    expect(user.email).to eq("person@example.com")
    expect(user).to be_verified
  end

  it "finds the existing user on a repeat sign-in instead of creating a duplicate" do
    existing = create(:user, :oauth, provider: "facebook", uid: "12345", email: "person@example.com")

    expect {
      described_class.call(auth_hash)
    }.not_to change(User, :count)

    expect(described_class.call(auth_hash)).to eq(existing)
  end

  it "does not overwrite the stored email on a repeat sign-in with no email (e.g. Apple)" do
    existing = create(:user, :oauth, provider: "apple", uid: "999", email: "first-time@example.com")

    found = described_class.call(auth_hash(provider: "apple", uid: "999", email: nil))

    expect(found).to eq(existing)
    expect(found.email).to eq("first-time@example.com")
  end

  it "falls back to a placeholder email when the provider gives none on first sign-in" do
    user = described_class.call(auth_hash(provider: "apple", uid: "555", email: nil))

    expect(user.email).to eq("apple-555@users.pikotchat.local")
  end
end
