require "rails_helper"

RSpec.describe "POST /signup", type: :request do
  let(:valid_params) do
    { email: "new@example.com", password: "password123", password_confirmation: "password123" }
  end

  it "creates an unverified user and sends a verification email" do
    expect {
      post "/signup", params: valid_params
    }.to change(User, :count).by(1).and change(ActionMailer::Base.deliveries, :count).by(1)

    expect(response).to have_http_status(:created)
    expect(response.parsed_body["user"]).to include("email" => "new@example.com", "verified" => false)

    expect(User.last).not_to be_verified
  end

  it "rejects a mismatched password_confirmation" do
    post "/signup", params: valid_params.merge(password_confirmation: "different")

    expect(response).to have_http_status(:unprocessable_content)
    expect(response.parsed_body["errors"]).to be_present
  end

  it "rejects a duplicate email" do
    create(:user, email: "new@example.com")

    post "/signup", params: valid_params

    expect(response).to have_http_status(:unprocessable_content)
    expect(response.parsed_body["errors"].join).to match(/email/i)
  end
end
