require_relative "boot"

require "rails"
# Pick the frameworks you want:
require "active_model/railtie"
require "active_job/railtie"
require "active_record/railtie"
require "active_storage/engine"
require "action_controller/railtie"
require "action_mailer/railtie"
require "action_mailbox/engine"
require "action_text/engine"
require "action_view/railtie"
require "action_cable/engine"
# require "rails/test_unit/railtie"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module App
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 8.1

    # Please, add to the `ignore` list any other `lib` subdirectories that do
    # not contain `.rb` files, or that should not be reloaded or eager loaded.
    # Common ones are `templates`, `generators`, or `middleware`, for example.
    config.autoload_lib(ignore: %w[assets tasks])

    # Configuration for the application, engines, and railties goes here.
    #
    # These settings can be overridden in specific environments using the files
    # in config/environments, which are processed later.
    #
    # config.time_zone = "Central Time (US & Canada)"
    # config.eager_load_paths << Rails.root.join("extras")

    # Only loads a smaller set of middleware suitable for API only apps.
    # Middleware like session, flash, cookies can be added back manually.
    # Skip views, helpers and assets when generating a new resource.
    config.api_only = true

    # OmniAuth (KAN-7) needs a session: omniauth-oauth2 stores its CSRF `state` param
    # there between the request and callback phases, and CsrfTokensController hands out
    # a Rails CSRF token (also session-backed) for the frontend's oauth request form.
    # JSON API actions never touch `session`, so this doesn't add cookies to their
    # responses.
    #
    # same_site: :none + secure: true because the session cookie has to survive a
    # cross-site trip: it's set from the frontend's `GET /csrf_token` fetch (localhost:8080
    # -> localhost:3000) and read back on the hidden form's `POST /auth/:provider` submit.
    # The default SameSite=Lax only rides along on cross-site top-level GET navigations,
    # not POST, so that second request would arrive with no session and fail CSRF
    # validation. assume_ssl: true because rack-session's own security_matches? check
    # (independent of and stricter than Rails' `always_write_cookie`) refuses to write a
    # `secure` cookie at all unless the request came in over real SSL -- which local dev
    # over plain http never does. `Secure`/SameSite=None cookies are still honored by the
    # browser over plain http on localhost specifically, since Chrome (and others) treat
    # it as a secure context.
    config.middleware.use ActionDispatch::Cookies
    config.middleware.use ActionDispatch::Session::CookieStore, key: "_pikotchat_session",
                                                                 same_site: :none, secure: true,
                                                                 assume_ssl: true

    # Rails' CSRF protection (on by default since `load_defaults`) also requires the
    # request's Origin header to equal the receiving server's own origin -- fine for a
    # same-origin app, but always false here since the frontend (FRONTEND_ORIGIN) and
    # backend intentionally live on different origins. That's not a hole: the token
    # itself is still validated against the session, and cors.rb's
    # `Access-Control-Allow-Origin` already restricts which origin can ever retrieve a
    # valid token from GET /csrf_token to begin with.
    config.action_controller.forgery_protection_origin_check = false
  end
end
