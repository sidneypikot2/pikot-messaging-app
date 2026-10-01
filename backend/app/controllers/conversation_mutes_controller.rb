# Muting a conversation's notifications for the current user (KAN-41).
class ConversationMutesController < ApplicationController
  before_action :authenticate_request!

  # duration_minutes: 15, 60, 480 or 1440; blank = until turned back on.
  def update
    conversation = current_user.conversations.find(params[:conversation_id])
    Conversations::MuteService.call(conversation: conversation, user: current_user, minutes: params[:duration_minutes].presence)
    render json: { conversation: ConversationSerializer.call(conversation, current_user: current_user) }
  end

  def destroy
    conversation = current_user.conversations.find(params[:conversation_id])
    Conversations::MuteService.call(conversation: conversation, user: current_user, minutes: false)
    render json: { conversation: ConversationSerializer.call(conversation, current_user: current_user) }
  end
end
