module Users
  # Settings → Profile (KAN-63): name, username and photo. Only the fields sent change;
  # remove_avatar takes the photo away. Everyone who shares a chat with the user — and
  # their own other tabs — gets the new name and photo live.
  class ProfileUpdater < ApplicationService
    FIELDS = %i[first_name last_name username].freeze

    def initialize(user:, params:)
      @user = user
      @params = params
    end

    def call
      FIELDS.each { |field| assign(field) if @params.key?(field) }
      assign_avatar if @params[:avatar].present?
      @user.save!
      @user.avatar.purge if remove_avatar? && @params[:avatar].blank? && @user.avatar.attached?
      UpdateBroadcaster.call(@user)
      @user
    end

    private

    def assign(field)
      value = @params[field]
      unless value.nil? || value.is_a?(String)
        @user.errors.add(field, "must be text")
        raise ActiveRecord::RecordInvalid, @user
      end
      @user.public_send(:"#{field}=", value&.strip.presence)
    end

    # Only an uploaded file: anything else would be read as a signed blob id and raise.
    def assign_avatar
      unless @params[:avatar].is_a?(ActionDispatch::Http::UploadedFile)
        @user.errors.add(:avatar, "must be an image file")
        raise ActiveRecord::RecordInvalid, @user
      end
      @user.avatar = @params[:avatar]
    end

    def remove_avatar?
      ActiveModel::Type::Boolean.new.cast(@params[:remove_avatar]) == true
    end
  end
end
