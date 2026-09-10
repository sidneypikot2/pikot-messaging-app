require "rails_helper"

RSpec.describe "Sessions", type: :request do
  describe "POST /login" do
    it "returns a token for a verified user with correct credentials" do
      create(:user, :verified, email: "user@example.com", password: "password123", password_confirmation: "password123")

      post "/login", params: { email: "USER@example.com", password: "password123" }

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["token"]).to be_present
      expect(response.parsed_body["user"]).to include("email" => "user@example.com")
    end

    it "rejects an incorrect password" do
      create(:user, :verified, email: "user@example.com", password: "password123", password_confirmation: "password123")

      post "/login", params: { email: "user@example.com", password: "wrong" }

      expect(response).to have_http_status(:unauthorized)
    end

    it "rejects an unknown email" do
      post "/login", params: { email: "nobody@example.com", password: "password123" }

      expect(response).to have_http_status(:unauthorized)
    end

    it "rejects login for an unverified account" do
      create(:user, email: "user@example.com", password: "password123", password_confirmation: "password123")

      post "/login", params: { email: "user@example.com", password: "password123" }

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "GET /me" do
    it "returns the current user for a valid token" do
      user = create(:user, :verified)
      token = JsonWebToken.encode(user_id: user.id)

      get "/me", headers: { "Authorization" => "Bearer #{token}" }

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["user"]).to include("email" => user.email)
    end

    it "rejects a missing token" do
      get "/me"
      expect(response).to have_http_status(:unauthorized)
    end

    it "rejects an invalid token" do
      get "/me", headers: { "Authorization" => "Bearer not-a-real-token" }
      expect(response).to have_http_status(:unauthorized)
    end
  end
end
