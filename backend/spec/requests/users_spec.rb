require "rails_helper"

RSpec.describe "Users", type: :request do
  describe "GET /users/search" do
    it "returns matching users, excluding the current user" do
      current_user = create(:user, :verified)
      token = JsonWebToken.encode(user_id: current_user.id)
      match = create(:user, username: "janedoe")

      get "/users/search", params: { q: "jane" }, headers: { "Authorization" => "Bearer #{token}" }

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["users"].map { |u| u["id"] }).to eq([ match.id ])
    end

    it "requires authentication" do
      get "/users/search", params: { q: "jane" }
      expect(response).to have_http_status(:unauthorized)
    end
  end
end
