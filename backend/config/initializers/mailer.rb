# API key for the Resend ActionMailer delivery method (KAN-27, config.action_mailer.delivery_method
# = :resend in config/environments/production.rb). Blank in development/test, where those
# environments use their own delivery methods (letter_opener_web / :test) instead.
Resend.api_key = ENV["RESEND_API_KEY"]
