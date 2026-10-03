module Users
  # Settings → Password (KAN-63): needs the current password. Accounts that sign in with
  # a provider and never had a password have nothing to change here.
  class PasswordChanger < ApplicationService
    def initialize(user:, current_password:, password:, password_confirmation:)
      @user = user
      @current_password = current_password
      @password = password
      @password_confirmation = password_confirmation
    end

    def call
      fail_with(:base, "You sign in with #{@user.provider_name || 'a social account'}, so there's no password to change") unless @user.password_set?
      fail_with(:current_password, "is incorrect") unless @current_password.is_a?(String) && @user.authenticate(@current_password)
      fail_with(:password, "can't be blank") unless @password.is_a?(String) && @password.present?
      fail_with(:password_confirmation, "doesn't match Password") unless @password_confirmation == @password

      @user.update!(password: @password)
      @user
    end

    private

    def fail_with(attribute, message)
      @user.errors.add(attribute, message)
      raise ActiveRecord::RecordInvalid, @user
    end
  end
end
