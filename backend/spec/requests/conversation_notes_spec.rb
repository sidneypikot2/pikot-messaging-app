require "rails_helper"

# Pinned note per chat (KAN-44).
RSpec.describe "Conversation notes", type: :request do
  let(:alice) { create(:user, :verified, first_name: "Alice", last_name: "Smith") }
  let(:bob) { create(:user, first_name: "Bob", last_name: "Jones") }
  let(:carol) { create(:user, first_name: "Carol", last_name: "King") }
  let(:group) { Groupchats::CreateService.call(owner: alice, name: "Trip", member_ids: [ bob.id, carol.id ]) }
  let(:direct) { Conversations::FindOrCreateDirectService.call(current_user: alice, other_user_id: bob.id) }

  def headers_for(user)
    { "Authorization" => "Bearer #{JsonWebToken.encode(user_id: user.id)}" }
  end

  describe "PUT /conversations/:id/note" do
    it "pins a note, records who edited it, and posts a system line" do
      put "/conversations/#{direct.id}/note", params: { body: "  Meet at 12 Main St\nhttps://maps.example.com  " },
        headers: headers_for(alice), as: :json

      expect(response).to have_http_status(:ok)
      note = response.parsed_body["conversation"]["note"]
      expect(note["body"]).to eq("Meet at 12 Main St\nhttps://maps.example.com")
      expect(note["updated_by"]).to eq("id" => alice.id, "name" => "Alice Smith")
      expect(note["updated_at"]).to be_present
      line = direct.messages.last
      expect(line).to be_system
      expect(line.system_event).to eq("type" => "note", "cleared" => false)
      expect(line.body).to eq("Alice Smith updated the pinned note")
    end

    it "lets any member edit it, not just whoever pinned it" do
      group.update!(note: "Flights TBD", note_updated_by: alice)

      put "/conversations/#{group.id}/note", params: { body: "Flights booked" }, headers: headers_for(carol), as: :json

      expect(response).to have_http_status(:ok)
      expect(group.reload.note).to eq("Flights booked")
      expect(group.note_updated_by).to eq(carol)
    end

    it "syncs live to every member" do
      expect {
        put "/conversations/#{group.id}/note", params: { body: "Hotel: Seaside Inn" }, headers: headers_for(alice), as: :json
      }.to have_broadcasted_to(carol).from_channel(NotificationsChannel)
        .with(hash_including(event: "conversation_updated", conversation: hash_including(note: hash_including(body: "Hotel: Seaside Inn"))))
    end

    it "removes the note when the body is blank" do
      direct.update!(note: "Old plan", note_updated_by: alice)

      put "/conversations/#{direct.id}/note", params: { body: "   " }, headers: headers_for(bob), as: :json

      expect(response.parsed_body["conversation"]["note"]).to be_nil
      expect(direct.reload.note).to be_nil
      expect(direct.messages.last.body).to eq("Bob Jones removed the pinned note")
    end

    it "posts nothing when the note didn't change" do
      direct.update!(note: "Same", note_updated_by: alice)

      expect {
        put "/conversations/#{direct.id}/note", params: { body: "Same" }, headers: headers_for(alice), as: :json
      }.not_to change(Message, :count)
    end

    it "rejects a note over the length limit" do
      put "/conversations/#{direct.id}/note", params: { body: "a" * (Conversation::NOTE_MAX_LENGTH + 1) },
        headers: headers_for(alice), as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(direct.reload.note).to be_nil
    end

    it "404s for someone who isn't in the chat" do
      put "/conversations/#{direct.id}/note", params: { body: "Hi" }, headers: headers_for(carol), as: :json

      expect(response).to have_http_status(:not_found)
    end

    it "requires a token" do
      put "/conversations/#{direct.id}/note", params: { body: "Hi" }, as: :json

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "GET /conversations/:id" do
    it "has no note until one is pinned" do
      get "/conversations/#{direct.id}", headers: headers_for(bob)

      expect(response.parsed_body["conversation"]["note"]).to be_nil
    end
  end
end
