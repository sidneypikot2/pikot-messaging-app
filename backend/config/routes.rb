Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Manual email/password auth (KAN-5)
  post "signup", to: "registrations#create"
  post "login", to: "sessions#create"
  get "me", to: "sessions#show"
  post "email_verification", to: "email_verifications#create"
  post "email_verification/resend", to: "email_verifications#resend"

  # Defines the root path route ("/")
  # root "posts#index"
end
