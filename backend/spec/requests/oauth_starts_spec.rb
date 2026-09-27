require "rails_helper"

RSpec.describe "GET /auth/:provider/start", type: :request do
  it "renders a same-origin auto-submitting form carrying a CSRF token" do
    get "/auth/facebook/start"

    expect(response).to have_http_status(:ok)
    expect(response.body).to include('action="/auth/facebook"')
    expect(response.body).to match(/name="authenticity_token" value="[^"]+"/)
  end

  it "404s for an unknown provider" do
    get "/auth/not_a_real_provider/start"

    expect(response).to have_http_status(:not_found)
  end
end
