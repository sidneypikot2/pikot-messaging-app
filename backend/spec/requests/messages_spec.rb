require "rails_helper"

RSpec.describe "Messages", type: :request do
  let(:current_user) { create(:user, :verified) }
  let(:token) { JsonWebToken.encode(user_id: current_user.id) }
  let(:auth_headers) { { "Authorization" => "Bearer #{token}" } }
  let(:conversation) { create(:conversation) }

  before do
    create(:conversation_membership, conversation: conversation, user: current_user)
  end

  describe "GET /conversations/:conversation_id/messages" do
    it "returns an empty page for a conversation with no messages" do
      get "/conversations/#{conversation.id}/messages", headers: auth_headers

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["messages"]).to eq([])
      expect(response.parsed_body["has_more"]).to be false
    end

    it "returns has_more: false when the thread exactly fills one page" do
      create_list(:message, 30, conversation: conversation)

      get "/conversations/#{conversation.id}/messages", headers: auth_headers

      expect(response.parsed_body["messages"].size).to eq(30)
      expect(response.parsed_body["has_more"]).to be false
    end

    it "paginates with has_more: true and a usable cursor" do
      messages = create_list(:message, 35, conversation: conversation)

      get "/conversations/#{conversation.id}/messages", headers: auth_headers

      first_page = response.parsed_body["messages"]
      expect(first_page.size).to eq(30)
      expect(response.parsed_body["has_more"]).to be true
      # oldest→newest order: the first page should be the 30 most recent messages.
      expect(first_page.first["id"]).to eq(messages[5].id)

      get "/conversations/#{conversation.id}/messages", params: { before: first_page.first["id"] }, headers: auth_headers

      second_page = response.parsed_body["messages"]
      expect(second_page.size).to eq(5)
      expect(response.parsed_body["has_more"]).to be false
      expect(second_page.last["id"]).to eq(messages[4].id)
    end

    it "404s for a conversation the user is not a member of" do
      other_conversation = create(:conversation)

      get "/conversations/#{other_conversation.id}/messages", headers: auth_headers

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /conversations/:conversation_id/messages" do
    it "creates a message" do
      post "/conversations/#{conversation.id}/messages", params: { body: "hi" }, headers: auth_headers

      expect(response).to have_http_status(:created)
      expect(response.parsed_body["message"]["body"]).to eq("hi")
    end
  end

  describe "PATCH /messages/:id" do
    it "updates a message the current user sent" do
      message = create(:message, conversation: conversation, sender: current_user)

      patch "/messages/#{message.id}", params: { body: "edited" }, headers: auth_headers

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["message"]["body"]).to eq("edited")
      expect(response.parsed_body["message"]["edited"]).to be true
    end

    it "forbids editing someone else's message" do
      message = create(:message, conversation: conversation)

      patch "/messages/#{message.id}", params: { body: "edited" }, headers: auth_headers

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "DELETE /messages/:id" do
    it "soft-deletes a message the current user sent" do
      message = create(:message, conversation: conversation, sender: current_user)

      delete "/messages/#{message.id}", headers: auth_headers

      expect(response).to have_http_status(:no_content)
      expect(message.reload.deleted_at).to be_present
    end

    it "forbids deleting someone else's message" do
      message = create(:message, conversation: conversation)

      delete "/messages/#{message.id}", headers: auth_headers

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "POST /messages/:id/reactions" do
    it "adds a reaction" do
      message = create(:message, conversation: conversation)

      post "/messages/#{message.id}/reactions", params: { emoji: "👍" }, headers: auth_headers

      expect(response).to have_http_status(:ok)
      expect(MessageReaction.where(message: message, user: current_user, emoji: "👍")).to exist
    end

    it "toggles the reaction off on a second identical request" do
      message = create(:message, conversation: conversation)
      post "/messages/#{message.id}/reactions", params: { emoji: "👍" }, headers: auth_headers

      post "/messages/#{message.id}/reactions", params: { emoji: "👍" }, headers: auth_headers

      expect(response).to have_http_status(:ok)
      expect(MessageReaction.where(message: message, user: current_user, emoji: "👍")).not_to exist
    end

    it "forbids reacting to a message in a conversation the user is not a member of" do
      other_conversation = create(:conversation)
      message = create(:message, conversation: other_conversation)

      post "/messages/#{message.id}/reactions", params: { emoji: "👍" }, headers: auth_headers

      expect(response).to have_http_status(:forbidden)
    end
  end
end
