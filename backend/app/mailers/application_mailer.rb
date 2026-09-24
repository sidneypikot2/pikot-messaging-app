class ApplicationMailer < ActionMailer::Base
  default from: ENV.fetch("MAILER_FROM_EMAIL", "pikot08@gmail.com")
  layout "mailer"
end
