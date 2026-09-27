# Renders a same-origin, auto-submitting form that POSTs to the OmniAuth request phase
# (/auth/:provider). The frontend can't fetch a CSRF token itself and hand it to that POST:
# fetching from the frontend's own origin sets the session cookie as a response to a
# cross-site background request, which browsers increasingly refuse to store (frontend and
# backend are on different *.onrender.com subdomains, a public suffix, so they're different
# sites). Instead the frontend does a normal top-level navigation here first — the cookie is
# set as a same-site response to that navigation, so it's present when this page's own form
# submits back to /auth/:provider on the same origin.
class OauthStartsController < ApplicationController
  include ActionController::RequestForgeryProtection

  ALLOWED_PROVIDERS = %w[facebook google_oauth2 linkedin apple].freeze

  def show
    return render_not_found unless ALLOWED_PROVIDERS.include?(params[:provider])

    render html: auto_submit_form_html.html_safe, content_type: "text/html"
  end

  private

  def auto_submit_form_html
    <<~HTML
      <!DOCTYPE html>
      <html>
        <body>
          <form id="oauth-form" method="post" action="/auth/#{params[:provider]}">
            <input type="hidden" name="authenticity_token" value="#{form_authenticity_token}">
          </form>
          <script>document.getElementById("oauth-form").submit();</script>
        </body>
      </html>
    HTML
  end
end
