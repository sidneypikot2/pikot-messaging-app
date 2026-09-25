class ConversationsController < ApplicationController
  before_action :authenticate_request!

  def index
    conversations = current_user.conversations.order(updated_at: :desc)
    render json: { conversations: conversations.map { |c| ConversationSerializer.call(c, current_user: current_user) } }
  end

  def show
    conversation = current_user.conversations.find(params[:id])
    render json: { conversation: ConversationSerializer.call(conversation, current_user: current_user) }
  end

  def create
    conversation = Conversations::FindOrCreateDirectService.call(current_user: current_user, other_user_id: params[:user_id])
    render json: { conversation: ConversationSerializer.call(conversation, current_user: current_user) }, status: :created
  end
end
