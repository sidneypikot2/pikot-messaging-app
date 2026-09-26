# Credentials come from ENV — see backend/.env.example for the full list and where to
# get each one. Blank in development until real apps are registered with each provider;
# the routes/controllers work either way, but initiating a real flow will fail without them.
Rails.application.config.middleware.use OmniAuth::Builder do
  # public_profile grants first_name/last_name/picture — Facebook doesn't bundle it in
  # automatically, so without it Auth::OmniauthAuthenticator only ever sees an email and
  # first_name/last_name/avatar stay nil (KAN-17).
  provider :facebook, ENV["FACEBOOK_APP_ID"], ENV["FACEBOOK_APP_SECRET"], scope: "email,public_profile"

  provider :linkedin, ENV["LINKEDIN_CLIENT_ID"], ENV["LINKEDIN_CLIENT_SECRET"]

  # Default scope already includes email + profile (name/image come from profile), so no
  # scope: override needed here unlike Facebook.
  provider :google_oauth2, ENV["GOOGLE_CLIENT_ID"], ENV["GOOGLE_CLIENT_SECRET"]

  # Apple's Sign In requires response_mode "form_post" whenever "name"/"email" scopes are
  # requested — Apple POSTs back to the callback instead of redirecting with a GET.
  provider :apple, ENV["APPLE_CLIENT_ID"], nil, {
    scope: "email name",
    response_mode: "form_post",
    team_id: ENV["APPLE_TEAM_ID"],
    key_id: ENV["APPLE_KEY_ID"],
    pem: ENV["APPLE_PEM"]
  }
end

# Require the request phase (GET /auth/:provider) to be a CSRF-protected form POST —
# see CsrfTokensController and omniauth-rails_csrf_protection in the Gemfile.
OmniAuth.config.allowed_request_methods = [ :post ]

# Route provider failures (denied consent, etc.) through our own controller instead of
# OmniAuth's default plain-Rack response, so the frontend gets a normal redirect back.
OmniAuth.config.on_failure = proc { |env| OmniauthCallbacksController.action(:failure).call(env) }
