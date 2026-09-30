require "rails_helper"

RSpec.describe "Groupchats", type: :request do
  let(:current_user) { create(:user, :verified) }
  let(:auth_headers) { { "Authorization" => "Bearer #{JsonWebToken.encode(user_id: current_user.id)}" } }
  let(:bob) { create(:user) }
  let(:carol) { create(:user) }

  describe "POST /groupchats" do
    it "creates the group and returns it with its members" do
      post "/groupchats", params: { name: "Weekend trip", member_ids: [ bob.id, carol.id ] }, headers: auth_headers, as: :json

      expect(response).to have_http_status(:created)
      conversation = response.parsed_body["conversation"]
      expect(conversation).to include("kind" => "group", "name" => "Weekend trip", "other_user" => nil)
      expect(conversation["members"].map { |m| m["id"] }).to eq([ current_user.id, bob.id, carol.id ])
    end

    it "returns 422 with the reason when the group is invalid" do
      post "/groupchats", params: { name: "", member_ids: [ bob.id ] }, headers: auth_headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["errors"]).to include("Name can't be blank", "Add at least 2 people to the group")
    end

    it "requires authentication" do
      post "/groupchats", params: { name: "Trip", member_ids: [ bob.id, carol.id ] }, as: :json

      expect(response).to have_http_status(:unauthorized)
    end
  end

  # Everything below the conversation level is conversation-scoped, so a group gets it
  # for free — these pin that down for a 3-person group.
  describe "using a group" do
    let(:group) { Groupchats::CreateService.call(owner: current_user, name: "Trip", member_ids: [ bob.id, carol.id ]) }

    it "lets any member send a message that every member receives" do
      [ current_user, bob, carol ].each do |member|
        expect {
          post "/conversations/#{group.id}/messages", params: { body: "hi all" }, headers: auth_headers, as: :json
        }.to have_broadcasted_to(member).from_channel(NotificationsChannel).with(hash_including(event: "message_created"))
      end
    end

    it "counts unread messages from each other member" do
      create(:message, conversation: group, sender: bob)
      create(:message, conversation: group, sender: carol)

      get "/conversations", headers: auth_headers

      expect(response.parsed_body["conversations"].first["unread_count"]).to eq(2)
    end

    it "reports how far each other member has read" do
      first = create(:message, conversation: group, sender: current_user)
      second = create(:message, conversation: group, sender: current_user)
      group.conversation_memberships.find_by!(user: bob).update!(last_read_message_id: second.id)
      group.conversation_memberships.find_by!(user: carol).update!(last_read_message_id: first.id)

      get "/conversations/#{group.id}", headers: auth_headers

      receipts = response.parsed_body["conversation"]["read_receipts"].to_h { |r| [ r["user"]["id"], r["last_read_message_id"] ] }
      expect(receipts).to eq(bob.id => second.id, carol.id => first.id)
    end

    it "lets members react to each other's messages" do
      message = create(:message, conversation: group, sender: bob)

      post "/messages/#{message.id}/reactions", params: { emoji: "👍" }, headers: auth_headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(message.reactions.count).to eq(1)
    end

    it "keeps non-members out" do
      outsider_headers = { "Authorization" => "Bearer #{JsonWebToken.encode(user_id: create(:user).id)}" }

      get "/conversations/#{group.id}/messages", headers: outsider_headers

      expect(response).to have_http_status(:not_found)
    end
  end
end
