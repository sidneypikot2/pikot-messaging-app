require "rails_helper"

RSpec.describe Auth::OmniauthAuthenticator do
  def auth_hash(provider: "facebook", uid: "12345", email: "person@example.com",
                 first_name: "Jane", last_name: "Doe", image: nil)
    OmniAuth::AuthHash.new(
      provider: provider,
      uid: uid,
      info: OmniAuth::AuthHash::InfoHash.new(email: email, first_name: first_name, last_name: last_name, image: image)
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

  it "sets first_name, last_name, and a derived username on create" do
    user = described_class.call(auth_hash(email: "jane.doe@example.com", first_name: "Jane", last_name: "Doe"))

    expect(user.first_name).to eq("Jane")
    expect(user.last_name).to eq("Doe")
    expect(user.username).to eq("janedoe")
  end

  it "appends a numeric suffix when the derived username is already taken" do
    create(:user, username: "janedoe")

    user = described_class.call(auth_hash(uid: "other-uid", email: "jane.doe@example.com"))

    expect(user.username).to eq("janedoe1")
  end

  it "does not overwrite first_name, last_name, or username on a repeat sign-in with different data" do
    existing = create(:user, :oauth, provider: "facebook", uid: "12345",
                                      first_name: "Original", last_name: "Name", username: "originalname")

    found = described_class.call(auth_hash(first_name: "Changed", last_name: "Person"))

    expect(found).to eq(existing)
    expect(found.first_name).to eq("Original")
    expect(found.last_name).to eq("Name")
    expect(found.username).to eq("originalname")
  end

  describe "avatar" do
    it "attaches the provider's profile photo when present" do
      fake_io = StringIO.new(File.binread(Rails.root.join("spec/fixtures/files/avatar.png")))
      allow(URI).to receive(:open).with("https://example.com/photo.jpg").and_return(fake_io)

      user = described_class.call(auth_hash(image: "https://example.com/photo.jpg"))

      expect(user.avatar).to be_attached
    end

    it "does not attach an avatar when the provider sends none" do
      user = described_class.call(auth_hash(image: nil))

      expect(user.avatar).not_to be_attached
    end

    it "does not raise when the avatar download fails" do
      allow(URI).to receive(:open).and_raise(SocketError, "could not resolve host")

      expect {
        described_class.call(auth_hash(image: "https://example.com/broken.jpg"))
      }.not_to raise_error
    end
  end
end
