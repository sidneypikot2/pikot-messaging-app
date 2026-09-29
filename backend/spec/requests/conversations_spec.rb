require "rails_helper"

RSpec.describe "Conversations", type: :request do
  let(:current_user) { create(:user, :verified) }
  let(:token) { JsonWebToken.encode(user_id: current_user.id) }
  let(:auth_headers) { { "Authorization" => "Bearer #{token}" } }

  describe "GET /conversations" do
    it "lists only the current user's conversations" do
      other = create(:user)
      mine = create(:conversation)
      create(:conversation_membership, conversation: mine, user: current_user)
      create(:conversation_membership, conversation: mine, user: other)
      not_mine = create(:conversation)
      create(:conversation_membership, conversation: not_mine, user: other)

      get "/conversations", headers: auth_headers

      expect(response).to have_http_status(:ok)
      ids = response.parsed_body["conversations"].map { |c| c["id"] }
      expect(ids).to eq([ mine.id ])
    end

    it "counts messages from the other member as unread when nothing has been read yet" do
      other = create(:user)
      conversation = create(:conversation)
      create(:conversation_membership, conversation: conversation, user: current_user)
      create(:conversation_membership, conversation: conversation, user: other)
      create_list(:message, 3, conversation: conversation, sender: other)

      get "/conversations", headers: auth_headers

      expect(response.parsed_body["conversations"].first["unread_count"]).to eq(3)
    end

    it "does not count the current user's own messages as unread" do
      other = create(:user)
      conversation = create(:conversation)
      create(:conversation_membership, conversation: conversation, user: current_user)
      create(:conversation_membership, conversation: conversation, user: other)
      create_list(:message, 2, conversation: conversation, sender: current_user)

      get "/conversations", headers: auth_headers

      expect(response.parsed_body["conversations"].first["unread_count"]).to eq(0)
    end

    it "only counts messages sent after the current user's last_read_message_id" do
      other = create(:user)
      conversation = create(:conversation)
      membership = create(:conversation_membership, conversation: conversation, user: current_user)
      create(:conversation_membership, conversation: conversation, user: other)
      already_read = create(:message, conversation: conversation, sender: other)
      membership.update!(last_read_message_id: already_read.id)
      create_list(:message, 2, conversation: conversation, sender: other)

      get "/conversations", headers: auth_headers

      expect(response.parsed_body["conversations"].first["unread_count"]).to eq(2)
    end

    it "includes each conversation's last activity preview" do
      other = create(:user)
      conversation = create(:conversation)
      create(:conversation_membership, conversation: conversation, user: current_user)
      create(:conversation_membership, conversation: conversation, user: other)
      create(:message, conversation: conversation, sender: current_user, body: "See you soon")

      get "/conversations", headers: auth_headers

      activity = response.parsed_body["conversations"].first["last_activity"]
      expect(activity).to include("type" => "message", "body" => "See you soon")
      expect(activity["actor"]["id"]).to eq(current_user.id)
    end

    it "orders conversations by most recent activity, not creation" do
      quiet = create(:conversation, created_at: 1.hour.ago)
      busy = create(:conversation, created_at: 2.hours.ago)
      [ quiet, busy ].each { |c| create(:conversation_membership, conversation: c, user: current_user) }
      create(:message, conversation: quiet, sender: current_user, created_at: 30.minutes.ago)
      message = create(:message, conversation: busy, sender: current_user, created_at: 40.minutes.ago)
      create(:message_reaction, message: message, user: current_user)
      empty = create(:conversation, created_at: 45.minutes.ago)
      create(:conversation_membership, conversation: empty, user: current_user)

      get "/conversations", headers: auth_headers

      expect(response.parsed_body["conversations"].map { |c| c["id"] }).to eq([ busy.id, quiet.id, empty.id ])
    end
  end

  describe "POST /conversations/:id/read" do
    it "marks the conversation caught up to its latest message" do
      other = create(:user)
      conversation = create(:conversation)
      create(:conversation_membership, conversation: conversation, user: current_user)
      create(:conversation_membership, conversation: conversation, user: other)
      create_list(:message, 3, conversation: conversation, sender: other)

      post "/conversations/#{conversation.id}/read", headers: auth_headers
      expect(response).to have_http_status(:no_content)

      get "/conversations", headers: auth_headers
      expect(response.parsed_body["conversations"].first["unread_count"]).to eq(0)
    end

    it "404s for a conversation the user is not a member of" do
      conversation = create(:conversation)

      post "/conversations/#{conversation.id}/read", headers: auth_headers

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "GET /conversations/:id" do
    it "returns a conversation the user is a member of" do
      conversation = create(:conversation)
      create(:conversation_membership, conversation: conversation, user: current_user)

      get "/conversations/#{conversation.id}", headers: auth_headers

      expect(response).to have_http_status(:ok)
    end

    it "404s for a conversation the user is not a member of" do
      conversation = create(:conversation)

      get "/conversations/#{conversation.id}", headers: auth_headers

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /conversations" do
    it "creates or reuses a direct conversation with the given user" do
      other = create(:user)

      post "/conversations", params: { user_id: other.id }, headers: auth_headers

      expect(response).to have_http_status(:created)
      expect(response.parsed_body["conversation"]["other_user"]["id"]).to eq(other.id)
    end
  end

  it "requires authentication" do
    get "/conversations"
    expect(response).to have_http_status(:unauthorized)
  end
end
