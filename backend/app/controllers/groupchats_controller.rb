class GroupchatsController < ApplicationController
  before_action :authenticate_request!

  def create
    conversation = Groupchats::CreateService.call(owner: current_user, name: params[:name], member_ids: params[:member_ids])
    render json: { conversation: ConversationSerializer.call(conversation, current_user: current_user) }, status: :created
  end
end
