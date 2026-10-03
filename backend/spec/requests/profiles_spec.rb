require "rails_helper"

RSpec.describe "Profile (user settings, KAN-63)", type: :request do
  let(:user) { create(:user, :verified) }
  let(:headers) { { "Authorization" => "Bearer #{JsonWebToken.encode(user_id: user.id)}" } }
  let(:avatar) { fixture_file_upload("avatar.png", "image/png") }

  def share_chat(*users)
    conversation = create(:conversation)
    users.each { |member| create(:conversation_membership, conversation: conversation, user: member) }
    conversation
  end

  describe "PATCH /me" do
    it "updates the name and username and returns the user with how they sign in" do
      patch "/me", params: { first_name: " Alicia ", last_name: "Keys", username: "alicia_k" }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["user"]).to include("first_name" => "Alicia", "last_name" => "Keys", "username" => "alicia_k",
                                                      "password_set" => true, "provider" => nil)
      expect(user.reload.display_name).to eq("Alicia Keys")
    end

    it "only changes the fields it's sent" do
      patch "/me", params: { first_name: "Alicia" }, headers: headers, as: :json

      expect(user.reload).to have_attributes(first_name: "Alicia", last_name: "User")
    end

    it "uploads a new photo and can remove it" do
      patch "/me", params: { avatar: avatar }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body.dig("user", "avatar_url")).to be_present

      patch "/me", params: { remove_avatar: "true" }, headers: headers

      expect(response.parsed_body.dig("user", "avatar_url")).to be_nil
      expect(user.reload.avatar).not_to be_attached
    end

    it "rejects a photo that isn't an image" do
      patch "/me", params: { avatar: fixture_file_upload("not-an-image.txt", "text/plain") }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(user.reload.avatar).not_to be_attached
    end

    it "applies the signup rules" do
      create(:user, username: "taken")

      patch "/me", params: { first_name: "", username: "Taken" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["errors"]).to include("First name can't be blank", "Username has already been taken")
    end

    it "rejects an avatar that isn't a file" do
      patch "/me", params: { avatar: "not-a-file" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["errors"]).to eq([ "Avatar must be an image file" ])
    end

    it "rejects a value that isn't text" do
      patch "/me", params: { first_name: 42 }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(user.reload.first_name).to eq("Test")
    end

    it "lets an OAuth user leave the name blank but checks a username they pick" do
      oauth_user = create(:user, :oauth)
      oauth_headers = { "Authorization" => "Bearer #{JsonWebToken.encode(user_id: oauth_user.id)}" }

      patch "/me", params: { first_name: "Sam", username: "no spaces" }, headers: oauth_headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)

      patch "/me", params: { first_name: "Sam", username: "sam_1" }, headers: oauth_headers, as: :json
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["user"]).to include("username" => "sam_1", "password_set" => false, "provider" => "facebook")
    end

    it "tells everyone who shares a chat with the user, and not strangers" do
      contact = create(:user)
      stranger = create(:user)
      share_chat(user, contact)

      expect {
        patch "/me", params: { first_name: "Alicia" }, headers: headers, as: :json
      }.to have_broadcasted_to(contact).from_channel(NotificationsChannel)
        .with(hash_including(event: "user_updated", user: hash_including(id: user.id, first_name: "Alicia")))
        .and have_broadcasted_to(user).from_channel(NotificationsChannel).with(hash_including(event: "user_updated"))
        .and have_broadcasted_to(stranger).from_channel(NotificationsChannel).exactly(0)
    end

    it "requires authentication" do
      patch "/me", params: { first_name: "Alicia" }, as: :json

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "DELETE /me" do
    it "needs the right password" do
      delete "/me", params: { password: "wrong-password" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["errors"]).to eq([ "Password is incorrect" ])
      expect(user.reload).not_to be_deleted
    end

    it "needs DELETE typed for an account without a password" do
      oauth_user = create(:user, :oauth)
      oauth_headers = { "Authorization" => "Bearer #{JsonWebToken.encode(user_id: oauth_user.id)}" }

      delete "/me", params: { confirmation: "delete" }, headers: oauth_headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)

      delete "/me", params: { confirmation: "DELETE" }, headers: oauth_headers, as: :json
      expect(response).to have_http_status(:no_content)
      expect(oauth_user.reload).to have_attributes(deleted?: true, provider: nil, uid: nil)
    end

    it "scrubs the account, keeps its messages, and frees the email" do
      user.avatar.attach(io: File.open(file_fixture("avatar.png")), filename: "avatar.png", content_type: "image/png")
      contact = create(:user)
      direct = share_chat(user, contact)
      message = create(:message, conversation: direct, sender: user, body: "hi")
      email = user.email

      expect {
        delete "/me", params: { password: "password123" }, headers: headers, as: :json
      }.to have_broadcasted_to(contact).from_channel(NotificationsChannel)
        .with(hash_including(event: "user_updated", user: hash_including(id: user.id, deleted: true, first_name: nil)))

      expect(response).to have_http_status(:no_content)
      expect(user.reload).to have_attributes(deleted?: true, first_name: nil, username: nil, password_digest: nil, display_name: "PikotChat user")
      expect(user.avatar).not_to be_attached
      expect(message.reload.body).to eq("hi")
      expect(create(:user, email: email)).to be_persisted
    end

    it "drops nicknames others gave the account" do
      contact = create(:user)
      direct = share_chat(user, contact)
      direct.conversation_memberships.find_by(user: user).update!(nickname: "Ally")

      delete "/me", params: { password: "password123" }, headers: headers, as: :json

      expect(direct.conversation_memberships.find_by(user: user).nickname).to be_nil
    end

    it "leaves every group, passing ownership on" do
      others = create_list(:user, 2)
      group = create(:conversation, kind: :group, name: "Trip", owner: user)
      [ user, *others ].each { |member| create(:conversation_membership, conversation: group, user: member) }

      delete "/me", params: { password: "password123" }, headers: headers, as: :json

      expect(group.reload.members).to match_array(others)
      expect(group.owner).to eq(others.first)
      expect(group.messages.last.system_event).to include("type" => "left")
    end

    it "signs the account out and keeps it out" do
      delete "/me", params: { password: "password123" }, headers: headers, as: :json

      get "/me", headers: headers
      expect(response).to have_http_status(:unauthorized)

      post "/login", params: { email: user.email, password: "password123" }, as: :json
      expect(response).to have_http_status(:unauthorized)
    end

    it "closes direct chats with the account and hides it from search and new chats" do
      contact = create(:user, :verified)
      direct = share_chat(user, contact)
      contact_headers = { "Authorization" => "Bearer #{JsonWebToken.encode(user_id: contact.id)}" }
      user.update!(username: "findme")

      delete "/me", params: { password: "password123" }, headers: headers, as: :json

      post "/conversations/#{direct.id}/messages", params: { body: "still there?" }, headers: contact_headers, as: :json
      expect(response).to have_http_status(:forbidden)

      get "/users/search", params: { q: "PikotChat" }, headers: contact_headers
      expect(response.parsed_body["users"]).to be_empty

      post "/conversations", params: { user_id: user.id }, headers: contact_headers, as: :json
      expect(response).to have_http_status(:not_found)
    end

    it "requires authentication" do
      delete "/me", params: { password: "password123" }, as: :json

      expect(response).to have_http_status(:unauthorized)
    end
  end
end
