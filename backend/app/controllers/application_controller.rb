class ApplicationController < ActionController::API
  private

  attr_reader :current_user

  def authenticate_request!
    token = request.headers["Authorization"]&.split(" ")&.last
    payload = token && JsonWebToken.decode(token)
    @current_user = payload && User.find_by(id: payload[:user_id])

    render json: { error: "Unauthorized" }, status: :unauthorized unless @current_user
  end

  def serialize_user(user)
    { id: user.id, email: user.email, verified: user.verified? }
  end
end
