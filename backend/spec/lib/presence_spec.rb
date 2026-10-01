require "rails_helper"

RSpec.describe Presence do
  include ActiveSupport::Testing::TimeHelpers

  let(:user) { create(:user) }

  it "is offline until connected, and online while any tab is" do
    expect(described_class.status(user.id)).to eq("offline")

    described_class.connect(user.id, "tab-a")
    described_class.connect(user.id, "tab-b")
    described_class.disconnect(user.id, "tab-a")
    expect(described_class.status(user.id)).to eq("online")

    described_class.disconnect(user.id, "tab-b")
    expect(described_class.status(user.id)).to eq("offline")
  end

  it "lets a connection lapse when its heartbeat stops" do
    described_class.connect(user.id, "tab-a")

    travel(Presence::TTL + 1.second) do
      expect(described_class.status(user.id)).to eq("offline")
    end
  end

  it "keeps a connection alive while it heartbeats" do
    described_class.connect(user.id, "tab-a")

    travel(Presence::TTL - 1.second)
    described_class.heartbeat(user.id, "tab-a")
    travel(Presence::TTL - 1.second)

    expect(described_class.status(user.id)).to eq("online")
  end

  it "shows idle only once every open tab is away" do
    described_class.connect(user.id, "tab-a")
    described_class.connect(user.id, "tab-b")

    described_class.set_away(user.id, "tab-a", true)
    expect(described_class.status(user.id)).to eq("online")

    described_class.set_away(user.id, "tab-b", true)
    expect(described_class.status(user.id)).to eq("idle")

    described_class.set_away(user.id, "tab-a", false)
    expect(described_class.status(user.id)).to eq("online")
  end

  it "shows the chosen status while connected, and offline when they chose to appear offline" do
    described_class.connect(user.id, "tab-a")

    user.update!(chosen_status: "dnd")
    expect(described_class.status(user.id)).to eq("dnd")
    user.update!(chosen_status: "idle")
    expect(described_class.status(user.id)).to eq("idle")
    user.update!(chosen_status: "offline")
    expect(described_class.status(user.id)).to eq("offline")
  end

  it "reports several users at once" do
    other = create(:user)
    described_class.connect(user.id, "tab-a")

    expect(described_class.statuses([ user.id, other.id ])).to eq(user.id => "online", other.id => "offline")
  end

  describe ".track" do
    it "broadcasts and records last_seen_at only when what others see changes" do
      contact = create(:user)
      conversation = create(:conversation)
      [ user, contact ].each { |member| create(:conversation_membership, conversation: conversation, user: member) }
      described_class.connect(user.id, "tab-a")

      expect { described_class.track(user) { described_class.connect(user.id, "tab-b") } }
        .not_to have_broadcasted_to(contact).from_channel(NotificationsChannel)

      freeze_time do
        expect { described_class.track(user) { user.update!(chosen_status: "offline") } }
          .to have_broadcasted_to(contact).from_channel(NotificationsChannel).with(event: "presence", user_id: user.id, status: "offline", last_seen_at: Time.current)
        expect(user.reload.last_seen_at).to eq(Time.current)
      end
    end
  end

  # The store development and production actually use — only runs where a Redis server
  # is reachable (e.g. `docker compose run --rm backend bundle exec rspec`).
  describe Presence::RedisStore do
    subject(:store) { described_class.new(ENV.fetch("REDIS_URL", "redis://localhost:6379/1")) }

    let(:user_id) { "spec-#{SecureRandom.hex(4)}" }

    before do
      Redis.new(url: ENV.fetch("REDIS_URL", "redis://localhost:6379/1")).ping
    rescue Redis::BaseConnectionError
      skip "no Redis server reachable"
    end

    it "counts live and non-away connections per user, ignoring expired ones" do
      store.add(user_id, "tab-a", 1.minute.from_now)
      store.add(user_id, "tab-b", 1.minute.from_now)
      store.add(user_id, "tab-stale", 1.minute.ago)
      store.set_away(user_id, "tab-a", true)
      expect(store.connections([ user_id, "#{user_id}-nobody" ])).to eq(user_id => [ 2, 1 ], "#{user_id}-nobody" => [ 0, 0 ])

      store.remove(user_id, "tab-b")
      expect(store.connections([ user_id ])).to eq(user_id => [ 1, 0 ])
      store.remove(user_id, "tab-a")
      expect(store.connections([ user_id ])).to eq(user_id => [ 0, 0 ])
    end
  end
end
