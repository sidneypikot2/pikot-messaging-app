require "rails_helper"

RSpec.describe "Password (user settings, KAN-63)", type: :request do
  let(:user) { create(:user, :verified) }
  let(:headers) { { "Authorization" => "Bearer #{JsonWebToken.encode(user_id: user.id)}" } }

  def change(params, as_headers: headers)
    patch "/me/password", params: params, headers: as_headers, as: :json
  end

  it "changes the password when the current one is right" do
    change({ current_password: "password123", password: "newpassword1", password_confirmation: "newpassword1" })

    expect(response).to have_http_status(:no_content)
    expect(user.reload.authenticate("newpassword1")).to be_truthy
  end

  it "rejects a wrong current password" do
    change({ current_password: "nope", password: "newpassword1", password_confirmation: "newpassword1" })

    expect(response).to have_http_status(:unprocessable_content)
    expect(response.parsed_body["errors"]).to eq([ "Current password is incorrect" ])
    expect(user.reload.authenticate("password123")).to be_truthy
  end

  it "rejects a mismatched confirmation, a short password and a missing one" do
    change({ current_password: "password123", password: "newpassword1", password_confirmation: "different1" })
    expect(response.parsed_body["errors"]).to eq([ "Password confirmation doesn't match Password" ])

    change({ current_password: "password123", password: "short", password_confirmation: "short" })
    expect(response.parsed_body["errors"]).to eq([ "Password is too short (minimum is 8 characters)" ])

    change({ current_password: "password123", password_confirmation: "x" })
    expect(response.parsed_body["errors"]).to eq([ "Password can't be blank" ])
    expect(user.reload.authenticate("password123")).to be_truthy
  end

  it "has nothing to change for an account that signs in with a provider" do
    oauth_user = create(:user, :oauth)

    change({ current_password: "", password: "newpassword1", password_confirmation: "newpassword1" },
           as_headers: { "Authorization" => "Bearer #{JsonWebToken.encode(user_id: oauth_user.id)}" })

    expect(response).to have_http_status(:unprocessable_content)
    expect(response.parsed_body["errors"].first).to include("You sign in with Facebook")
  end

  it "requires authentication" do
    patch "/me/password", params: { current_password: "password123" }, as: :json

    expect(response).to have_http_status(:unauthorized)
  end
end
