class UserSerializer < ApplicationService
  # own: the signed-in user looking at themselves (GET/PATCH /me) — adds how they sign in,
  # which Settings needs (KAN-63) and nobody else does.
  def initialize(user, own: false)
    @user = user
    @own = own
  end

  def call
    json = { id: @user.id, email: @user.email, username: @user.username,
             first_name: @user.first_name, last_name: @user.last_name, verified: @user.verified?,
             avatar_url: avatar_url, deleted: @user.deleted? }
    @own ? json.merge(provider: @user.provider, password_set: @user.password_set?) : json
  end

  private

  def avatar_url
    @user.avatar.attached? ? Rails.application.routes.url_helpers.rails_blob_url(@user.avatar) : nil
  end
end
