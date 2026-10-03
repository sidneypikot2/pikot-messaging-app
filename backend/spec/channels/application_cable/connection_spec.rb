require "rails_helper"

RSpec.describe ApplicationCable::Connection, type: :channel do
  it "connects with a valid token" do
    user = create(:user)
    token = JsonWebToken.encode(user_id: user.id)

    connect "/cable?token=#{token}"

    expect(connection.current_user).to eq(user)
  end

  it "rejects a missing token" do
    expect { connect "/cable" }.to have_rejected_connection
  end

  it "rejects an invalid token" do
    expect { connect "/cable?token=not-a-real-token" }.to have_rejected_connection
  end

  it "rejects a deleted account's still-valid token (KAN-63)" do
    user = create(:user, deleted_at: Time.current)

    expect { connect "/cable?token=#{JsonWebToken.encode(user_id: user.id)}" }.to have_rejected_connection
  end
end
