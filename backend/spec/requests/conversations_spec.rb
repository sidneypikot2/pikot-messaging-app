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
