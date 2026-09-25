require "rails_helper"

RSpec.describe UserSerializer do
  it "returns id, email, name, username, avatar_url, and verified status" do
    user = create(:user, :verified)

    expect(described_class.call(user)).to eq(
      id: user.id, email: user.email, username: user.username,
      first_name: user.first_name, last_name: user.last_name, verified: true,
      avatar_url: nil
    )
  end

  it "returns a URL when an avatar is attached" do
    user = create(:user, :verified)
    user.avatar.attach(io: File.open(Rails.root.join("spec/fixtures/files/avatar.png")), filename: "avatar.png", content_type: "image/png")

    expect(described_class.call(user)[:avatar_url]).to match(%r{\Ahttp://})
  end

  it "reports unverified users correctly" do
    user = create(:user)

    expect(described_class.call(user)[:verified]).to be false
  end
end
