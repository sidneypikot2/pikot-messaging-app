class RegistrationsController < ApplicationController
  def create
    user = User.new(user_params)

    if user.save
      user.deliver_email_verification
      render json: { user: serialize_user(user) }, status: :created
    else
      render json: { errors: user.errors.full_messages }, status: :unprocessable_content
    end
  end

  private

  def user_params
    params.permit(:email, :password, :password_confirmation)
  end
end
