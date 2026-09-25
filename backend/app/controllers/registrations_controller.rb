class RegistrationsController < ApplicationController
  def create
    user = Auth::UserRegistrar.call(**user_params.to_h.symbolize_keys)

    if user.persisted?
      render json: { user: UserSerializer.call(user) }, status: :created
    else
      render json: { errors: user.errors.full_messages }, status: :unprocessable_content
    end
  end

  private

  def user_params
    params.permit(:email, :password, :password_confirmation, :first_name, :last_name, :username, :avatar)
  end
end
