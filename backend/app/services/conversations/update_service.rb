module Conversations
  # Renames a group or changes the chat theme (KAN-41). Any member can do either,
  # Messenger-style; each change gets its own system line in the thread.
  class UpdateService < ApplicationService
    def initialize(conversation:, user:, name: nil, theme: nil)
      @conversation = conversation
      @user = user
      @name = name
      @theme = theme
    end

    def call
      raise NotAuthorizedError, "not a member of this conversation" unless @conversation.member?(@user)
      raise NotAuthorizedError, "only group chats have a name" if !@name.nil? && !@conversation.group?

      @conversation.name = @name unless @name.nil?
      @conversation.theme = @theme.presence unless @theme.nil?
      changes = @conversation.changes_to_save.slice("name", "theme")
      return @conversation if changes.empty?

      @conversation.save!
      changes.each_key { |attribute| post_system_line(attribute) }
      Broadcaster.call(@conversation)
      @conversation
    end

    private

    def post_system_line(attribute)
      event = attribute == "name" ? { type: "renamed", name: @conversation.name } : { type: "theme", theme: @conversation.theme }
      SystemMessageService.call(conversation: @conversation, actor: @user, event: event)
    end
  end
end
