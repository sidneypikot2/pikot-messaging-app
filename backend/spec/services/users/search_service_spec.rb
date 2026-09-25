require "rails_helper"

RSpec.describe Users::SearchService do
  it "matches by username" do
    current_user = create(:user)
    match = create(:user, username: "janedoe")
    create(:user, username: "someoneelse")

    results = described_class.call(current_user: current_user, query: "jane")

    expect(results).to contain_exactly(match)
  end

  it "matches by first or last name, case-insensitively" do
    current_user = create(:user)
    match = create(:user, first_name: "Jane", last_name: "Doe")

    expect(described_class.call(current_user: current_user, query: "DOE")).to contain_exactly(match)
  end

  it "excludes the current user" do
    current_user = create(:user, username: "selfsearch")

    expect(described_class.call(current_user: current_user, query: "selfsearch")).to be_empty
  end

  it "returns nothing for a blank query" do
    current_user = create(:user)
    create(:user)

    expect(described_class.call(current_user: current_user, query: "")).to be_empty
  end
end
