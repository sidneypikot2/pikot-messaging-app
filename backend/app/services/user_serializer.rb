class UserSerializer < ApplicationService
  def initialize(user)
    @user = user
  end

  def call
    { id: @user.id, email: @user.email, verified: @user.verified? }
  end
end
