require "rails_helper"

RSpec.describe "Email verification", type: :request do
  describe "POST /email_verification" do
    it "verifies a user with a valid token" do
      user = create(:user)
      token = user.generate_token_for(:email_verification)

      post "/email_verification", params: { token: token }

      expect(response).to have_http_status(:ok)
      expect(user.reload).to be_verified
    end

    it "rejects an invalid token" do
      post "/email_verification", params: { token: "not-a-real-token" }

      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "POST /email_verification/resend" do
    it "sends another verification email for an unverified account" do
      user = create(:user)

      expect {
        post "/email_verification/resend", params: { email: user.email }
      }.to change(ActionMailer::Base.deliveries, :count).by(1)

      expect(response).to have_http_status(:ok)
    end

    it "does not send an email for an already-verified account, but still responds success" do
      user = create(:user, :verified)

      expect {
        post "/email_verification/resend", params: { email: user.email }
      }.not_to change(ActionMailer::Base.deliveries, :count)

      expect(response).to have_http_status(:ok)
    end

    it "responds success without leaking whether the email is registered" do
      post "/email_verification/resend", params: { email: "nobody@example.com" }

      expect(response).to have_http_status(:ok)
    end
  end
end
