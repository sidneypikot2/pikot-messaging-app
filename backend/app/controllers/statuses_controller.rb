# The current user's chosen status (KAN-39).
class StatusesController < ApplicationController
  before_action :authenticate_request!

  def update
    Users::StatusUpdater.call(current_user, params.require(:status))
    render json: { status: current_user.chosen_status }
  end
end
