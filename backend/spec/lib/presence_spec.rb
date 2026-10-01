require "rails_helper"

RSpec.describe Presence do
  include ActiveSupport::Testing::TimeHelpers

  it "reports the first connection as coming online and the last disconnect as going offline" do
    expect(described_class.connect(1, "tab-a")).to be(true)
    expect(described_class.connect(1, "tab-b")).to be(false)

    expect(described_class.disconnect(1, "tab-a")).to be(false)
    expect(described_class.online?(1)).to be(true)
    expect(described_class.disconnect(1, "tab-b")).to be(true)
    expect(described_class.online?(1)).to be(false)
  end

  it "lets a connection lapse when its heartbeat stops" do
    described_class.connect(1, "tab-a")

    travel(Presence::TTL + 1.second) do
      expect(described_class.online?(1)).to be(false)
    end
  end

  it "keeps a connection alive while it heartbeats" do
    described_class.connect(1, "tab-a")

    travel(Presence::TTL - 1.second)
    described_class.heartbeat(1, "tab-a")
    travel(Presence::TTL - 1.second)

    expect(described_class.online?(1)).to be(true)
  end

  it "filters a list of ids down to who is online" do
    described_class.connect(1, "tab-a")
    described_class.connect(3, "tab-c")

    expect(described_class.online_ids([ 1, 2, 3 ])).to eq([ 1, 3 ])
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

    it "counts live connections per user and drops expired ones" do
      expect(store.add(user_id, "tab-a", 1.minute.from_now)).to eq(1)
      expect(store.add(user_id, "tab-b", 1.minute.from_now)).to eq(2)
      expect(store.add(user_id, "tab-stale", 1.minute.ago)).to eq(2)
      expect(store.online_ids([ user_id, "#{user_id}-nobody" ])).to eq([ user_id ])

      expect(store.remove(user_id, "tab-a")).to eq(1)
      expect(store.remove(user_id, "tab-b")).to eq(0)
      expect(store.online_ids([ user_id ])).to eq([])
    end
  end
end
