module Auth
  # Issues an API session (JWT + serialized user) for an already-authenticated user.
  # Shared endpoint for every auth method — password login today, OAuth providers
  # (KAN-7) later just need to hand it a User once they've resolved one.
  class SessionIssuer < ApplicationService
    def initialize(user)
      @user = user
    end

    def call
      { token: JsonWebToken.encode(user_id: @user.id), user: UserSerializer.call(@user) }
    end
  end
end
