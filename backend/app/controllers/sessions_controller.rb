class SessionsController < ApplicationController
  before_action :authenticate_request!, only: :show

  def create
    email = params[:email].to_s.strip.downcase
    user = User.find_by(email: email)

    unless user&.authenticate(params[:password])
      return render json: { error: "Invalid email or password" }, status: :unauthorized
    end

    unless user.verified?
      return render json: { error: "Please verify your email before logging in." }, status: :forbidden
    end

    token = JsonWebToken.encode(user_id: user.id)
    render json: { token: token, user: serialize_user(user) }, status: :ok
  end

  def show
    render json: { user: serialize_user(current_user) }, status: :ok
  end
end
