require "rails_helper"

RSpec.describe Auth::SessionIssuer do
  it "returns a valid JWT for the user plus their serialized data" do
    user = create(:user, :verified)

    result = described_class.call(user)

    expect(JsonWebToken.decode(result[:token])[:user_id]).to eq(user.id)
    expect(result[:user]).to eq(UserSerializer.call(user))
  end
end
