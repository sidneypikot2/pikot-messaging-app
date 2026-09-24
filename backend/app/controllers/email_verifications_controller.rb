class EmailVerificationsController < ApplicationController
  def create
    user = User.find_by_token_for(:email_verification, params[:token])

    if user
      user.update!(verified_at: Time.current)
      render json: { message: "Email verified." }, status: :ok
    else
      render json: { error: "Invalid or expired verification link." }, status: :unprocessable_content
    end
  end

  def resend
    email = params[:email].to_s.strip.downcase
    user = User.find_by(email: email)
    user.deliver_email_verification if user && !user.verified?

    # Always respond success so this endpoint can't be used to check which emails are registered.
    render json: { message: "If that account exists and is unverified, a verification email has been sent." }, status: :ok
  end
end
