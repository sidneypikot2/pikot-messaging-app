require "rails_helper"

# Conversation settings (KAN-41): rename, theme, nicknames, members, mute, delete chat.
RSpec.describe "Conversation settings", type: :request do
  let(:current_user) { create(:user, :verified, first_name: "Alice", last_name: "Smith") }
  let(:auth_headers) { { "Authorization" => "Bearer #{JsonWebToken.encode(user_id: current_user.id)}" } }
  let(:bob) { create(:user, first_name: "Bob", last_name: "Jones") }
  let(:carol) { create(:user, first_name: "Carol", last_name: "King") }
  let(:group) { Groupchats::CreateService.call(owner: current_user, name: "Trip", member_ids: [ bob.id, carol.id ]) }
  let(:direct) { Conversations::FindOrCreateDirectService.call(current_user: current_user, other_user_id: bob.id) }

  def headers_for(user)
    { "Authorization" => "Bearer #{JsonWebToken.encode(user_id: user.id)}" }
  end

  describe "PATCH /conversations/:id" do
    it "renames a group and posts a system line" do
      patch "/conversations/#{group.id}", params: { name: "Beach trip" }, headers: auth_headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["conversation"]["name"]).to eq("Beach trip")
      line = group.messages.last
      expect(line).to be_system
      expect(line.system_event).to eq("type" => "renamed", "name" => "Beach trip")
      expect(line.body).to eq("Alice Smith named the group Beach trip")
    end

    it "tells every member about the change" do
      expect {
        patch "/conversations/#{group.id}", params: { theme: "blue" }, headers: auth_headers, as: :json
      }.to have_broadcasted_to(carol).from_channel(NotificationsChannel)
        .with(hash_including(event: "conversation_updated", conversation: hash_including(theme: "blue")))
    end

    it "changes a direct chat's theme" do
      patch "/conversations/#{direct.id}", params: { theme: "purple" }, headers: auth_headers, as: :json

      expect(direct.reload.theme).to eq("purple")
      expect(direct.messages.last.system_event).to eq("type" => "theme", "theme" => "purple")
    end

    it "rejects an unknown theme" do
      patch "/conversations/#{direct.id}", params: { theme: "plaid" }, headers: auth_headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "doesn't let a direct chat be named" do
      patch "/conversations/#{direct.id}", params: { name: "Us" }, headers: auth_headers, as: :json

      expect(response).to have_http_status(:forbidden)
    end

    it "posts nothing when nothing changed" do
      expect {
        patch "/conversations/#{group.id}", params: { name: "Trip" }, headers: auth_headers, as: :json
      }.not_to change(Message, :count)
    end
  end

  describe "PATCH /conversations/:id/members/:user_id (nickname)" do
    it "sets a nickname everyone sees, with a system line" do
      patch "/conversations/#{direct.id}/members/#{bob.id}", params: { nickname: "Bobby" }, headers: auth_headers, as: :json

      expect(response).to have_http_status(:ok)
      bob_entry = response.parsed_body["conversation"]["members"].find { |m| m["id"] == bob.id }
      expect(bob_entry["nickname"]).to eq("Bobby")
      expect(direct.messages.last.body).to eq("Alice Smith set the nickname for Bob Jones to Bobby")
    end

    it "clears a nickname when blank" do
      direct.conversation_memberships.find_by!(user: bob).update!(nickname: "Bobby")

      patch "/conversations/#{direct.id}/members/#{bob.id}", params: { nickname: " " }, headers: auth_headers, as: :json

      expect(direct.conversation_memberships.find_by!(user: bob).nickname).to be_nil
      expect(direct.messages.last.system_event["nickname"]).to be_nil
    end

    it "404s for someone who isn't in the chat" do
      patch "/conversations/#{direct.id}/members/#{carol.id}", params: { nickname: "C" }, headers: auth_headers, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /conversations/:id/members" do
    let(:dave) { create(:user, first_name: "Dave", last_name: "Lee") }

    it "adds people, who get the group in their list" do
      expect {
        post "/conversations/#{group.id}/members", params: { member_ids: [ dave.id ] }, headers: auth_headers, as: :json
      }.to have_broadcasted_to(dave).from_channel(NotificationsChannel).with(hash_including(event: "conversation_created"))

      expect(group.reload.members).to include(dave)
      expect(group.messages.last.body).to eq("Alice Smith added Dave Lee")
    end

    it "422s when everyone picked is already in the group" do
      post "/conversations/#{group.id}/members", params: { member_ids: [ bob.id ] }, headers: auth_headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "is groups only" do
      post "/conversations/#{direct.id}/members", params: { member_ids: [ dave.id ] }, headers: auth_headers, as: :json

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "DELETE /conversations/:id/members/:user_id" do
    it "lets the owner remove someone" do
      expect {
        delete "/conversations/#{group.id}/members/#{bob.id}", headers: auth_headers
      }.to have_broadcasted_to(bob).from_channel(NotificationsChannel).with(event: "conversation_removed", conversation_id: group.id)

      expect(response).to have_http_status(:no_content)
      expect(group.reload.members).not_to include(bob)
      expect(group.messages.last.body).to eq("Alice Smith removed Bob Jones from the group")
    end

    it "doesn't let anyone else remove people" do
      delete "/conversations/#{group.id}/members/#{carol.id}", headers: headers_for(bob)

      expect(response).to have_http_status(:forbidden)
    end

    it "lets anyone leave, handing ownership on when the owner does" do
      delete "/conversations/#{group.id}/members/#{current_user.id}", headers: auth_headers

      expect(group.reload.owner).to eq(bob)
      expect(group.messages.last.system_event).to eq("type" => "left")
    end

    it "deletes the group when the last person leaves" do
      group.conversation_memberships.where.not(user: current_user).destroy_all

      delete "/conversations/#{group.id}/members/#{current_user.id}", headers: auth_headers

      expect(Conversation.exists?(group.id)).to be(false)
    end
  end

  describe "mute" do
    it "mutes for a while, for the current user only" do
      put "/conversations/#{group.id}/mute", params: { duration_minutes: 60 }, headers: auth_headers, as: :json

      body = response.parsed_body["conversation"]
      expect(body["muted"]).to be(true)
      expect(Time.zone.parse(body["muted_until"])).to be_within(5.seconds).of(1.hour.from_now)
      get "/conversations/#{group.id}", headers: headers_for(bob)
      expect(response.parsed_body["conversation"]["muted"]).to be(false)
    end

    it "mutes until turned back on" do
      put "/conversations/#{group.id}/mute", headers: auth_headers, as: :json

      expect(response.parsed_body["conversation"]).to include("muted" => true, "muted_until" => nil)
    end

    it "rejects other durations" do
      put "/conversations/#{group.id}/mute", params: { duration_minutes: 7 }, headers: auth_headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "unmutes" do
      put "/conversations/#{group.id}/mute", headers: auth_headers, as: :json
      delete "/conversations/#{group.id}/mute", headers: auth_headers

      expect(response.parsed_body["conversation"]["muted"]).to be(false)
    end

    it "is no longer muted once the time is up" do
      group.conversation_memberships.find_by!(user: current_user).update!(muted_until: 1.minute.ago)

      get "/conversations/#{group.id}", headers: auth_headers

      expect(response.parsed_body["conversation"]["muted"]).to be(false)
    end
  end

  describe "DELETE /conversations/:id (delete chat for you)" do
    it "hides the history and the chat for the current user only" do
      create(:message, conversation: direct, sender: bob, body: "old")

      delete "/conversations/#{direct.id}", headers: auth_headers

      expect(response).to have_http_status(:no_content)
      get "/conversations", headers: auth_headers
      expect(response.parsed_body["conversations"]).to be_empty
      get "/conversations/#{direct.id}/messages", headers: headers_for(bob)
      expect(response.parsed_body["messages"].map { |m| m["body"] }).to eq([ "old" ])
    end

    it "brings the chat back with only what's new once someone writes" do
      create(:message, conversation: direct, sender: bob, body: "old")
      delete "/conversations/#{direct.id}", headers: auth_headers
      create(:message, conversation: direct, sender: bob, body: "new")

      get "/conversations", headers: auth_headers
      listed = response.parsed_body["conversations"].first
      expect(listed["unread_count"]).to eq(1)
      expect(listed["last_activity"]["body"]).to eq("new")
      get "/conversations/#{direct.id}/messages", headers: auth_headers
      expect(response.parsed_body["messages"].map { |m| m["body"] }).to eq([ "new" ])
    end
  end

  describe "system messages" do
    let(:line) { Conversations::SystemMessageService.call(conversation: group, actor: current_user, event: { type: "left" }) }

    it "can't be edited, unsent or reacted to" do
      patch "/messages/#{line.id}", params: { body: "x" }, headers: auth_headers, as: :json
      expect(response).to have_http_status(:forbidden)

      delete "/messages/#{line.id}", headers: auth_headers
      expect(response).to have_http_status(:forbidden)

      post "/messages/#{line.id}/reactions", params: { emoji: "👍" }, headers: auth_headers, as: :json
      expect(response).to have_http_status(:forbidden)
    end

    it "can't be replied to" do
      post "/conversations/#{group.id}/messages", params: { body: "hm", reply_to_message_id: line.id }, headers: auth_headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "come with their kind and event" do
      line
      get "/conversations/#{group.id}/messages", headers: auth_headers

      expect(response.parsed_body["messages"].last).to include("kind" => "system", "system_event" => { "type" => "left" })
    end
  end
end
