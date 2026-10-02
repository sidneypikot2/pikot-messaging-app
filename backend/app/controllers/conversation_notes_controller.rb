# The chat's pinned note (KAN-44); a blank body removes it.
class ConversationNotesController < ApplicationController
  before_action :authenticate_request!

  def update
    conversation = Conversations::NoteUpdateService.call(
      conversation: current_user.conversations.find(params[:conversation_id]), user: current_user, body: params[:body]
    )
    render json: { conversation: ConversationSerializer.call(conversation, current_user: current_user) }
  end
end
