module Conversations
  # Posts a grey system line into the thread (KAN-41), e.g. "Alice renamed the group",
  # and delivers it like any new message, so lists and open threads update the same way.
  # `event` is what happened ({ type: "renamed", name: "Trip" }); the frontend words it,
  # since "You renamed …" depends on who's reading. The body is a plain-text fallback.
  class SystemMessageService < ApplicationService
    def initialize(conversation:, actor:, event:)
      @conversation = conversation
      @actor = actor
      @event = event.deep_stringify_keys
    end

    def call
      message = @conversation.messages.create!(sender: @actor, kind: :system, system_event: @event, body: fallback_text)
      payload = { event: "message_created", message: MessageSerializer.call(message, current_user: @actor) }
      ConversationChannel.broadcast_to(@conversation, payload)
      @conversation.members.each { |member| NotificationsChannel.broadcast_to(member, payload) }
      message
    end

    private

    def fallback_text
      "#{@actor.display_name} #{action_text}"
    end

    def action_text
      case @event["type"]
      when "renamed" then "named the group #{@event['name']}"
      when "theme" then "changed the theme"
      when "nickname" then nickname_text
      when "added" then "added #{@event['targets'].map { |t| t['name'] }.to_sentence}"
      when "removed" then "removed #{@event.dig('target', 'name')} from the group"
      when "left" then "left the group"
      end
    end

    def nickname_text
      target = @event.dig("target", "name")
      return "cleared the nickname for #{target}" if @event["nickname"].blank?

      "set the nickname for #{target} to #{@event['nickname']}"
    end
  end
end
