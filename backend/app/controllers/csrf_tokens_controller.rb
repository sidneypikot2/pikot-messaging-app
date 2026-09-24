# Hands the frontend a Rails CSRF token to submit alongside the OAuth request-phase
# form POST (see omniauth-rails_csrf_protection in the Gemfile) — the frontend can't set
# a custom header for that request, since it has to be a real <form> submission (a plain
# fetch/XHR can't navigate the browser to the provider's consent screen), so the token
# travels as a hidden form field instead.
class CsrfTokensController < ApplicationController
  include ActionController::RequestForgeryProtection

  def show
    render json: { csrf_token: form_authenticity_token }
  end
end
