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
    let(:user) { create(:user) }
    let(:contact) { create(:user) }

    before { share_conversation(user, contact) }

    it "marks the user online and tells the people they share a conversation with, not strangers" do
      stranger = create(:user)
      stub_connection current_user: user

      expect { subscribe }
        .to have_broadcasted_to(contact).with(event: "presence", user_id: user.id, status: "online", last_seen_at: nil)
        .and not_have_broadcasted_to(stranger)
      expect(Presence.status(user.id)).to eq("online")
    end

    it "marks the user offline, records last_seen_at and tells their contacts on unsubscribe" do
      stub_connection current_user: user
      subscribe

      freeze_time do
        expect { unsubscribe }
          .to have_broadcasted_to(contact).with(event: "presence", user_id: user.id, status: "offline", last_seen_at: Time.current)
        expect(user.reload.last_seen_at).to eq(Time.current)
      end
    end

    it "stays online and says nothing while another tab is still open" do
      Presence.connect(user.id, "other-tab")
      stub_connection current_user: user

      expect { subscribe }.not_to have_broadcasted_to(contact)
      expect { unsubscribe }.not_to have_broadcasted_to(contact)
      expect(Presence.status(user.id)).to eq("online")
    end

    it "goes idle when the tab reports it's away, and back online when it isn't" do
      stub_connection current_user: user
      subscribe

      expect { perform :away, away: true }
        .to have_broadcasted_to(contact).with(hash_including(event: "presence", status: "idle"))
      expect { perform :away, away: false }
        .to have_broadcasted_to(contact).with(hash_including(event: "presence", status: "online"))
    end

    it "puts a timed status that has run out back to Online on the next heartbeat, and says so" do
      user.update!(chosen_status: "dnd", chosen_status_until: 10.minutes.from_now)
      stub_connection current_user: user
      subscribe

      travel 11.minutes do
        expect { subscription.send(:heartbeat) }
          .to have_broadcasted_to(contact).with(hash_including(event: "presence", status: "online"))
          .and have_broadcasted_to(user).with(hash_including(event: "presence", status: "online"))
        expect(user.reload).to have_attributes(chosen_status: "online", chosen_status_until: nil)
      end
    end

    it "says nothing to anyone when someone appearing offline connects" do
      user.update!(chosen_status: "offline")
      stub_connection current_user: user

      expect { subscribe }.not_to have_broadcasted_to(contact)
    end
  end
end
