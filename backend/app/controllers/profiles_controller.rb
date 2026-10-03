# The signed-in user's own account (KAN-63): Settings → Profile saves through update,
# Delete account through destroy. GET /me is SessionsController#show.
class ProfilesController < ApplicationController
  before_action :authenticate_request!

  def update
    user = Users::ProfileUpdater.call(user: current_user, params: params.permit(:first_name, :last_name, :username, :avatar, :remove_avatar))
    render json: { user: UserSerializer.call(user, own: true) }
  end

  def destroy
    Users::AccountDeleter.call(user: current_user, password: params[:password], confirmation: params[:confirmation])
    head :no_content
  end
end
