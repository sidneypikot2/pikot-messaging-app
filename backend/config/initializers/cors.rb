# Be sure to restart your server when you modify this file.

# Avoid CORS issues when API is called from the frontend app.
# Handle Cross-Origin Resource Sharing (CORS) in order to accept cross-origin Ajax requests.

# Read more: https://github.com/cyu/rack-cors

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins ENV.fetch("FRONTEND_ORIGIN", "http://localhost:8080")

    # credentials: true lets the frontend's GET /csrf_token fetch (credentials: "include")
    # receive the session cookie the OAuth flow needs (KAN-7) — safe to enable broadly
    # since it only takes effect for requests that opt in with credentials: "include";
    # the existing JWT-based endpoints don't send cookies either way.
    resource "*",
      headers: :any,
      methods: [ :get, :post, :put, :patch, :delete, :options, :head ],
      credentials: true
  end
end
