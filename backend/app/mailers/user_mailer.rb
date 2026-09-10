class UserMailer < ApplicationMailer
  def email_verification(user)
    @user = user
    token = user.generate_token_for(:email_verification)
    @verification_url = "#{ENV.fetch('FRONTEND_ORIGIN', 'http://localhost:8080')}/verify-email.html?token=#{token}"

    mail(to: @user.email, subject: "Verify your email for PikotChat")
  end
end
