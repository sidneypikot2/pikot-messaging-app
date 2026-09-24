require "rails_helper"

RSpec.describe "OmniAuth callbacks", type: :request do
  after do
    OmniAuth.config.mock_auth[:facebook] = nil
  end

  # The request phase (POST /auth/:provider) is CSRF-protected (omniauth-rails_csrf_protection),
  # matching what the real frontend flow has to do: fetch a token, then submit it. In test
  # mode, hitting the request phase 302s to the callback instead of invoking it in-process,
  # so we follow that redirect to reach OmniauthCallbacksController.
  def start_oauth(provider)
    get "/csrf_token"
    token = response.parsed_body["csrf_token"]

    post "/auth/#{provider}", params: { authenticity_token: token }
    follow_redirect!
  end

  it "logs a new user in and redirects to the frontend with a token" do
    OmniAuth.config.mock_auth[:facebook] = OmniAuth::AuthHash.new(
      provider: "facebook",
      uid: "abc123",
      info: OmniAuth::AuthHash::InfoHash.new(email: "new-oauth-user@example.com")
    )

    expect {
      start_oauth("facebook")
    }.to change(User, :count).by(1)

    expect(response).to redirect_to(%r{\Ahttp://localhost:8080/oauth-callback\.html\?token=.+})

    user = User.find_by(provider: "facebook", uid: "abc123")
    expect(user.email).to eq("new-oauth-user@example.com")
    expect(user).to be_verified

    token = Rack::Utils.parse_query(URI.parse(response.location).query)["token"]
    expect(JsonWebToken.decode(token)[:user_id]).to eq(user.id)
  end

  it "logs an existing user back in without creating a duplicate" do
    existing = create(:user, :oauth, provider: "facebook", uid: "abc123")

    OmniAuth.config.mock_auth[:facebook] = OmniAuth::AuthHash.new(
      provider: "facebook",
      uid: "abc123",
      info: OmniAuth::AuthHash::InfoHash.new(email: "new-oauth-user@example.com")
    )

    expect {
      start_oauth("facebook")
    }.not_to change(User, :count)

    token = Rack::Utils.parse_query(URI.parse(response.location).query)["token"]
    expect(JsonWebToken.decode(token)[:user_id]).to eq(existing.id)
  end

  it "redirects to the frontend login page on provider failure" do
    OmniAuth.config.mock_auth[:facebook] = :invalid_credentials

    start_oauth("facebook")

    expect(response).to redirect_to(%r{\Ahttp://localhost:8080/login\.html\?oauth_error=.+})
  end
end

# omniauth-rails_csrf_protection's request-phase check is a no-op here: config/environments/test.rb
# sets allow_forgery_protection = false, same as it does for every other CSRF-protected action in
# this app. The specs above exercise the token being fetched and submitted (the real frontend flow);
# actually rejecting a missing/invalid token needs a manual check with forgery protection enabled.
