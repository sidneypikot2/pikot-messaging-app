class UserSerializer < ApplicationService
  def initialize(user)
    @user = user
  end

  def call
    { id: @user.id, email: @user.email, username: @user.username,
      first_name: @user.first_name, last_name: @user.last_name, verified: @user.verified? }
  end
end
