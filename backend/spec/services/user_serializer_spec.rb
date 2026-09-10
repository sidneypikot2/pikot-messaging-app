require "rails_helper"

RSpec.describe UserSerializer do
  it "returns id, email, and verified status" do
    user = create(:user, :verified)

    expect(described_class.call(user)).to eq(id: user.id, email: user.email, verified: true)
  end

  it "reports unverified users correctly" do
    user = create(:user)

    expect(described_class.call(user)[:verified]).to be false
  end
end
