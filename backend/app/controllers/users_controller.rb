class UsersController < ApplicationController
  before_action :authenticate_request!

  def search
    users = Users::SearchService.call(current_user: current_user, query: params[:q])
    render json: { users: users.map { |user| UserSerializer.call(user) } }, status: :ok
  end
end
