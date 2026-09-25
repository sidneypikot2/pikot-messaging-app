class ApplicationController < ActionController::API
  # Sets ActiveStorage::Current.url_options from the current request — included manually
  # since it's only auto-wired for ActionController::Base, not ActionController::API.
  # Needed for rails_blob_url (avatar_url in UserSerializer) to know the host/port/protocol.
  include ActiveStorage::SetCurrent

  rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
  rescue_from NotAuthorizedError, with: :render_forbidden

  private

  attr_reader :current_user

  def authenticate_request!
    token = request.headers["Authorization"]&.split(" ")&.last
    payload = token && JsonWebToken.decode(token)
    @current_user = payload && User.find_by(id: payload[:user_id])

    render json: { error: "Unauthorized" }, status: :unauthorized unless @current_user
  end

  def render_not_found
    render json: { error: "Not found" }, status: :not_found
  end

  def render_forbidden
    render json: { error: "Forbidden" }, status: :forbidden
  end
end
