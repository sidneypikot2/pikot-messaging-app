class UserSerializer < ApplicationService
  def initialize(user)
    @user = user
  end

  def call
    { id: @user.id, email: @user.email, username: @user.username,
      first_name: @user.first_name, last_name: @user.last_name, verified: @user.verified?,
      avatar_url: avatar_url }
  end

  private

  def avatar_url
    @user.avatar.attached? ? Rails.application.routes.url_helpers.rails_blob_url(@user.avatar) : nil
  end
end
