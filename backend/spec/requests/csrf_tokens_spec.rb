require "rails_helper"

RSpec.describe "GET /csrf_token", type: :request do
  it "returns a token" do
    get "/csrf_token"

    expect(response).to have_http_status(:ok)
    expect(response.parsed_body["csrf_token"]).to be_present
  end
end
