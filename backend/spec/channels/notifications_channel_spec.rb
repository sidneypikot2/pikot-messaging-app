require "rails_helper"

RSpec.describe NotificationsChannel, type: :channel do
  it "subscribes any authenticated user to their own stream" do
    user = create(:user)
    stub_connection current_user: user

    subscribe

    expect(subscription).to be_confirmed
    expect(subscription).to have_stream_for(user)
  end
end
