module Users
  # Settings → Delete account (KAN-63). Confirmed with the password, or by typing DELETE
  # for accounts that never had one. The row stays, scrubbed of everything personal, so
  # the messages it sent stay readable in other people's chats as "PikotChat user"
  # (Messenger does the same). The person leaves every group; direct chats stay, but
  # nobody can message the account again. The email is freed for a new signup.
  class AccountDeleter < ApplicationService
    CONFIRMATION_WORD = "DELETE".freeze

    def initialize(user:, password: nil, confirmation: nil)
      @user = user
      @password = password
      @confirmation = confirmation
    end

    def call
      confirm!
      recipients = nil
      # One transaction, so a failure part-way leaves the account as it was rather than
      # out of its groups but not deleted.
      ActiveRecord::Base.transaction do
        leave_groups
        recipients = contacts
        scrub
      end
      @user.avatar.purge_later if @user.avatar.attached?
      UpdateBroadcaster.call(@user, recipients: recipients)
      ActionCable.server.remote_connections.where(current_user: @user).disconnect
      @user
    end

    private

    def confirm!
      confirmed = if @user.password_set?
        @password.is_a?(String) && @user.authenticate(@password)
      else
        @confirmation == CONFIRMATION_WORD
      end
      return if confirmed

      @user.errors.add(:base, @user.password_set? ? "Password is incorrect" : "Type #{CONFIRMATION_WORD} to confirm")
      raise ActiveRecord::RecordInvalid, @user
    end

    # Through the same path as "Leave group", so the others see "… left the group" (said
    # while the name is still there) and ownership passes on.
    def leave_groups
      @user.conversations.where(kind: :group).find_each do |conversation|
        Conversations::RemoveMemberService.call(conversation: conversation, user: @user, member_id: @user.id)
      end
    end

    # Worked out before scrubbing; the user's own tabs are included so they sign out.
    def contacts
      User.where(id: ConversationMembership.where(conversation_id: @user.conversation_memberships.select(:conversation_id)).select(:user_id))
          .or(User.where(id: @user.id)).to_a
    end

    # Nicknames others gave the person go too: a direct chat's title would show them
    # ahead of "PikotChat user". Names already written into past system lines ("Alice
    # left the group") stay as they were.
    def scrub
      @user.message_hides.delete_all
      @user.conversation_memberships.update_all(nickname: nil)
      # update_columns: the scrubbed row deliberately fails the signup validations.
      @user.update_columns(
        email: "deleted-#{@user.id}-#{SecureRandom.hex(6)}@deleted.pikotchat.invalid",
        first_name: nil, last_name: nil, username: nil, password_digest: nil,
        provider: nil, uid: nil, verified_at: nil, last_seen_at: nil,
        chosen_status: "online", chosen_status_until: nil,
        deleted_at: Time.current, updated_at: Time.current
      )
    end
  end
end
