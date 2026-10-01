class SessionsController < ApplicationController
  before_action :authenticate_request!, only: :show

  def create
    result = Auth::PasswordAuthenticator.call(email: params[:email], password: params[:password])

    case result
    when :invalid_credentials
      render json: { error: "Invalid email or password" }, status: :unauthorized
    when :unverified
      render json: { error: "Please verify your email before logging in." }, status: :forbidden
    else
      render json: Auth::SessionIssuer.call(result), status: :ok
    end
  end

  def show
    render json: { user: UserSerializer.call(current_user), status: current_user.current_chosen_status,
                   status_until: current_user.chosen_status_expired? ? nil : current_user.chosen_status_until }, status: :ok
  end
end
