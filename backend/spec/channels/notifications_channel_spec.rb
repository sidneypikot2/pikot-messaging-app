require "rails_helper"

RSpec.describe NotificationsChannel, type: :channel do
  include ActiveSupport::Testing::TimeHelpers

  RSpec::Matchers.define_negated_matcher :not_have_broadcasted_to, :have_broadcasted_to

  def share_conversation(*users)
    conversation = create(:conversation)
    users.each { |user| create(:conversation_membership, conversation: conversation, user: user) }
    conversation
  end

  it "subscribes any authenticated user to their own stream" do
    user = create(:user)
    stub_connection current_user: user

    subscribe

    expect(subscription).to be_confirmed
    expect(subscription).to have_stream_for(user)
  end

  describe "presence (KAN-39)" do
    it "marks the user online and tells the people they share a conversation with" do
      user = create(:user)
      contact = create(:user)
      stranger = create(:user)
      share_conversation(user, contact)
      stub_connection current_user: user

      expect { subscribe }
        .to have_broadcasted_to(contact).with(event: "presence", user_id: user.id, online: true, last_seen_at: nil)
        .and not_have_broadcasted_to(stranger)
      expect(Presence.online?(user.id)).to be(true)
    end

    it "marks the user offline, records last_seen_at and tells their contacts on unsubscribe" do
      user = create(:user)
      contact = create(:user)
      share_conversation(user, contact)
      stub_connection current_user: user
      subscribe

      freeze_time do
        expect { unsubscribe }
          .to have_broadcasted_to(contact).with(event: "presence", user_id: user.id, online: false, last_seen_at: Time.current)
        expect(user.reload.last_seen_at).to eq(Time.current)
      end
      expect(Presence.online?(user.id)).to be(false)
    end

    it "stays online and says nothing while another tab is still open" do
      user = create(:user)
      contact = create(:user)
      share_conversation(user, contact)
      Presence.connect(user.id, "other-tab")
      stub_connection current_user: user

      expect { subscribe }.not_to have_broadcasted_to(contact)
      expect { unsubscribe }.not_to have_broadcasted_to(contact)
      expect(Presence.online?(user.id)).to be(true)
    end
  end
end
