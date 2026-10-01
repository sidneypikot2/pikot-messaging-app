require "rails_helper"

RSpec.describe "Statuses", type: :request do
  include ActiveSupport::Testing::TimeHelpers

  let(:user) { create(:user, :verified) }
  let(:headers) { { "Authorization" => "Bearer #{JsonWebToken.encode(user_id: user.id)}" } }

  describe "PATCH /status" do
    it "saves the chosen status" do
      patch "/status", params: { status: "dnd" }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq("status" => "dnd", "status_until" => nil)
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

    it "can set Do Not Disturb or Offline for a while" do
      freeze_time do
        patch "/status", params: { status: "dnd", duration_minutes: 30 }, headers: headers, as: :json

        expect(response.parsed_body).to eq("status" => "dnd", "status_until" => 30.minutes.from_now.as_json)
        expect(user.reload.chosen_status_until).to eq(30.minutes.from_now)
      end
    end

    it "clears the timer when picking a status without one" do
      user.update!(chosen_status: "offline", chosen_status_until: 1.hour.from_now)

      patch "/status", params: { status: "dnd" }, headers: headers, as: :json

      expect(user.reload.chosen_status_until).to be_nil
    end

    it "rejects a duration that isn't one of the choices, or one on Online/Idle" do
      patch "/status", params: { status: "dnd", duration_minutes: 45 }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)

      patch "/status", params: { status: "idle", duration_minutes: 30 }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
      expect(user.reload.chosen_status).to eq("online")
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

    it "reports a timed status that has run out as Online" do
      user.update!(chosen_status: "dnd", chosen_status_until: 1.minute.ago)

      get "/me", headers: headers

      expect(response.parsed_body).to include("status" => "online", "status_until" => nil)
    end
  end
end
