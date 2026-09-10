class OmniauthCallbacksController < ApplicationController
  def create
    user = Auth::OmniauthAuthenticator.call(request.env["omniauth.auth"])
    session_data = Auth::SessionIssuer.call(user)
    redirect_to "#{frontend_origin}/oauth-callback.html?token=#{session_data[:token]}", allow_other_host: true
  end

  def failure
    message = request.env["omniauth.error.type"] || params[:message]
    redirect_to "#{frontend_origin}/login.html?oauth_error=#{message}", allow_other_host: true
  end

  private

  def frontend_origin
    ENV.fetch("FRONTEND_ORIGIN", "http://localhost:8080")
  end
end
