# The current user's chosen status (KAN-39), optionally for a while.
class StatusesController < ApplicationController
  before_action :authenticate_request!

  def update
    Users::StatusUpdater.call(current_user, params.require(:status), duration_minutes: params[:duration_minutes].presence)
    render json: { status: current_user.chosen_status, status_until: current_user.chosen_status_until }
  end
end
