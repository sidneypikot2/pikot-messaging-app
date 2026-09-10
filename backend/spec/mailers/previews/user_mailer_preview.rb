# Preview all emails at http://localhost:3000/rails/mailers/user_mailer
class UserMailerPreview < ActionMailer::Preview
  # Preview this email at http://localhost:3000/rails/mailers/user_mailer/email_verification
  def email_verification
    UserMailer.email_verification(User.new(id: 0, email: "preview@example.com"))
  end
end
