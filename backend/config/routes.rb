Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Preview sent emails in the browser (KAN-10) — dev-only.
  mount LetterOpenerWeb::Engine, at: "/letter_opener" if Rails.env.development?

  # Manual email/password auth (KAN-5)
  post "signup", to: "registrations#create"
  post "login", to: "sessions#create"
  get "me", to: "sessions#show"
  post "email_verification", to: "email_verifications#create"
  post "email_verification/resend", to: "email_verifications#resend"

  # Social login (KAN-7). /auth/:provider itself (the request phase) is handled by the
  # OmniAuth::Builder middleware, not a Rails route.
  get "csrf_token", to: "csrf_tokens#show"
  match "auth/:provider/callback", to: "omniauth_callbacks#create", via: [ :get, :post ]
  match "auth/failure", to: "omniauth_callbacks#failure", via: [ :get, :post ]

  # Direct messaging (KAN-14) — deliberately flat update/destroy rather than nesting all
  # 4 message actions under /conversations/:id/messages (see SPEC.md Section 7).
  get "users/search", to: "users#search"

  resources :conversations, only: [ :index, :show, :create ] do
    member { post :read }
    resources :messages, only: [ :index, :create ]
  end
  resources :messages, only: [ :update, :destroy ]

  mount ActionCable.server => "/cable"

  # Defines the root path route ("/")
  # root "posts#index"
end
