require "rails_helper"

RSpec.describe UserSerializer do
  it "returns id, email, name, username, and verified status" do
    user = create(:user, :verified)

    expect(described_class.call(user)).to eq(
      id: user.id, email: user.email, username: user.username,
      first_name: user.first_name, last_name: user.last_name, verified: true
    )
  end

  it "reports unverified users correctly" do
    user = create(:user)

    expect(described_class.call(user)[:verified]).to be false
  end
end
