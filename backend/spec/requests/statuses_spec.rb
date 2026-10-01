require "rails_helper"

RSpec.describe "Statuses", type: :request do
  let(:user) { create(:user, :verified) }
  let(:headers) { { "Authorization" => "Bearer #{JsonWebToken.encode(user_id: user.id)}" } }

  describe "PATCH /status" do
    it "saves the chosen status" do
      patch "/status", params: { status: "dnd" }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq("status" => "dnd")
      expect(user.reload.chosen_status).to eq("dnd")
    end

    it "tells contacts when it changes what they see" do
      contact = create(:user)
      conversation = create(:conversation)
      [ user, contact ].each { |member| create(:conversation_membership, conversation: conversation, user: member) }
      Presence.connect(user.id, "tab")

      expect {
        patch "/status", params: { status: "dnd" }, headers: headers, as: :json
      }.to have_broadcasted_to(contact).from_channel(NotificationsChannel).with(hash_including(event: "presence", user_id: user.id, status: "dnd"))
    end

    it "rejects an unknown status" do
      patch "/status", params: { status: "away" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(user.reload.chosen_status).to eq("online")
    end

    it "requires authentication" do
      patch "/status", params: { status: "dnd" }, as: :json

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "GET /me" do
    it "includes the user's own chosen status, which is never in UserSerializer" do
      user.update!(chosen_status: "offline")

      get "/me", headers: headers

      expect(response.parsed_body["status"]).to eq("offline")
      expect(response.parsed_body["user"]).not_to have_key("chosen_status")
    end
  end
end
