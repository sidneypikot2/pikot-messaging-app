# Settings → Password (KAN-63).
class PasswordsController < ApplicationController
  before_action :authenticate_request!

  def update
    Users::PasswordChanger.call(user: current_user, current_password: params[:current_password],
                                password: params[:password], password_confirmation: params[:password_confirmation])
    head :no_content
  end
end
